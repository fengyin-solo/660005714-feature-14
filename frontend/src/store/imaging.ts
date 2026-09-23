import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import type {
  VolumeData, ROIResult, ROIDef, StudyInfo, StudyItem, StudyGroup,
  ItemStatus, StudyLoadResult,
} from '@/types'

const SESSION_KEY = 'imaging.study-session.v1'
let uidSeq = 0
function uid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${uidSeq++}` }

function defaultView(): StudyItem['view'] {
  return {
    windowVal: 80, levelVal: 40,
    mprSlice: { axial: 32, coronal: 32, sagittal: 32 },
    roiDefs: [{ label: 'lesion1', center: [30, 28, 32], radius: 6 }],
    roiResults: [],
  }
}

/** 服务端响应体结构校验：只拒绝根本无法渲染的材料 */
function isValidVolume(v: any): v is VolumeData {
  if (!v || typeof v !== 'object') return false
  const dims = v.dimensions
  if (!Array.isArray(dims) || dims.length !== 3 || dims.some((n: any) => !Number.isInteger(n) || n <= 0)) return false
  if (!Array.isArray(v.volume) || v.volume.length !== dims[0]) return false
  if (!v.volume[0] || !Array.isArray(v.volume[0]) || v.volume[0].length !== dims[1]) return false
  if (!Array.isArray(v.volume[0][0]) || v.volume[0][0].length !== dims[2]) return false
  if (!v.mpr || !v.mpr.axial || !v.mpr.coronal || !v.mpr.sagittal) return false
  return true
}

function itemLabel(meta?: StudyInfo) {
  if (!meta) return '影像'
  return `${meta.modality} ${meta.bodyPart} · ${meta.patientName} · ${meta.studyDate}`
}

interface PersistedSession {
  version: 1
  activeGroupId: string | null
  groups: Array<{
    uid: string; name: string; focusedUid: string | null
    items: Array<{
      uid: string; studyId: string; name: string
      collapsed: boolean; view: StudyItem['view']
    }>
  }>
}

export const useImagingStore = defineStore('imaging', () => {
  const loading = ref(false)
  const groups = ref<StudyGroup[]>([])
  const activeGroupId = ref<string | null>(null)

  const activeGroup = computed<StudyGroup | null>(
    () => groups.value.find(g => g.uid === activeGroupId.value) ?? groups.value[0] ?? null)

  const focusedItem = computed<StudyItem | null>(() => {
    const g = activeGroup.value
    if (!g || !g.focusedUid) return null
    return g.items.find(i => i.uid === g.focusedUid) ?? null
  })

  // ---- 兼容旧版单份阅片/测量流程的"当前影像"视图 ----
  const volumeData = computed<VolumeData | null>(() => focusedItem.value?.volumeData ?? null)
  const preset = ref('brain')
  const windowVal = computed({
    get: () => focusedItem.value?.view.windowVal ?? 80,
    set: v => { if (focusedItem.value) focusedItem.value.view.windowVal = v },
  })
  const levelVal = computed({
    get: () => focusedItem.value?.view.levelVal ?? 40,
    set: v => { if (focusedItem.value) focusedItem.value.view.levelVal = v },
  })
  const mprSlice = computed({
    get: () => focusedItem.value?.view.mprSlice
      ?? { axial: 32, coronal: 32, sagittal: 32 },
    set: v => { if (focusedItem.value) focusedItem.value.view.mprSlice = v },
  })
  const roiDefs = computed({
    get: () => focusedItem.value?.view.roiDefs ?? [],
    set: (v: ROIDef[]) => { if (focusedItem.value) focusedItem.value.view.roiDefs = v },
  })
  const roiResults = computed<ROIResult[]>(() => focusedItem.value?.view.roiResults ?? [])

  function setActiveGroup(groupUid: string) { activeGroupId.value = groupUid }

  function focusStudy(itemUid: string) {
    const g = activeGroup.value
    if (!g) return
    if (g.focusedUid === itemUid) {
      // 再次点击当前聚焦项：仅展开（不收起焦点，避免界面失去目标）
      const it = g.items.find(i => i.uid === itemUid)
      if (it && it.collapsed) it.collapsed = false
      return
    }
    g.focusedUid = itemUid
    const it = g.items.find(i => i.uid === itemUid)
    if (it) it.collapsed = false
  }

  function toggleItemCollapse(itemUid: string) {
    const g = activeGroup.value
    const it = g?.items.find(i => i.uid === itemUid)
    if (!g || !it) return
    it.collapsed = !it.collapsed
    if (it.collapsed && g.focusedUid === it.uid) {
      // 收起当前聚焦项后，焦点交给组内第一个未收起且可用的材料
      const next = g.items.find(i => !i.collapsed && i.status !== 'loading' && i.status !== 'error')
        ?? g.items.find(i => !i.collapsed)
      g.focusedUid = next ? next.uid : it.uid
    }
  }

  function dismissWarning(itemUid: string) {
    const it = activeGroup.value?.items.find(i => i.uid === itemUid)
    if (it) it.warning = ''
  }

  function closeGroup(groupUid: string) {
    const idx = groups.value.findIndex(g => g.uid === groupUid)
    if (idx === -1) return
    groups.value.splice(idx, 1)
    if (activeGroupId.value === groupUid) {
      // 保留其它分组顺序，落到原位置相邻的组
      const next = groups.value[Math.min(idx, groups.value.length - 1)]
      activeGroupId.value = next ? next.uid : null
    }
  }

  function pickFocus(items: StudyItem[], preferredUid?: string | null): string | null {
    if (preferredUid && items.some(i => i.uid === preferredUid)) return preferredUid
    return items.find(i => !i.collapsed && i.status !== 'loading' && i.status !== 'error')?.uid
      ?? items.find(i => !i.collapsed)?.uid
      ?? items[0]?.uid ?? null
  }

  /** 旧版单份"载入影像"：走原有 /api/volume，不参与分组恢复 */
  async function loadVolume() {
    loading.value = true
    try {
      const { data } = await axios.post('/api/volume', {
        preset: preset.value, width: 64, height: 64, depth: 64,
      }) as { data: VolumeData }
      const view = defaultView()
      const item: StudyItem = {
        uid: uid('item'), studyId: null,
        name: `单份载入 · ${({ brain: '头部CT', chest: '胸部CT', abdomen: '腹部CT' } as Record<string, string>)[preset.value] ?? preset.value}`,
        status: 'ok', collapsed: false, warning: '', error: null,
        volumeData: data, view,
      }
      const group: StudyGroup = {
        uid: uid('group'), name: item.name, ephemeral: true,
        items: [item], focusedUid: item.uid,
      }
      groups.value.unshift(group)
      activeGroupId.value = group.uid
    } finally { loading.value = false }
  }

  /** 多选检查成组打开 */
  async function openStudyGroup(selected: StudyInfo[], groupName: string) {
    if (!selected.length) return
    const items: StudyItem[] = selected.map(meta => ({
      uid: uid('item'), studyId: meta.studyId, name: itemLabel(meta), meta,
      status: 'loading' as ItemStatus, collapsed: false, warning: '',
      error: null, volumeData: null, view: defaultView(),
    }))
    const group: StudyGroup = {
      uid: uid('group'), name: groupName, ephemeral: false,
      items, focusedUid: null,
    }
    groups.value.push(group)
    activeGroupId.value = group.uid
    await fillGroup(group)
  }

  async function fillGroup(group: StudyGroup) {
    const pending = group.items.filter(i => i.status === 'loading' && i.studyId)
    if (!pending.length) return
    loading.value = true
    let results: StudyLoadResult[]
    try {
      const { data } = await axios.post('/api/studies/load', {
        items: pending.map(i => ({ studyId: i.studyId })),
      })
      results = data.results
    } catch {
      // 整批请求失败（网络/服务不可用）：逐份标出，不影响已完成的组
      for (const it of pending) {
        it.status = 'error'
        it.error = { code: 'network', message: '影像服务连接失败，无法获取该份影像材料' }
      }
      loading.value = false
      return
    }
    pending.forEach((it, idx) => applyLoadResult(it, results[idx]))
    // 数据就绪后确定焦点（保留恢复时指定的焦点）
    group.focusedUid = pickFocus(group.items, group.focusedUid)
    loading.value = false
  }

  /** 损坏/失败的单份单独重试，不触碰同组其它份 */
  async function retryStudy(itemUid: string) {
    const g = activeGroup.value
    const it = g?.items.find(i => i.uid === itemUid)
    if (!g || !it || !it.studyId) return
    it.status = 'loading'; it.error = null
    loading.value = true
    try {
      const { data } = await axios.post('/api/studies/load', { items: [{ studyId: it.studyId }] })
      const status = applyLoadResult(it, data.results[0])
      if ((status === 'ok' || status === 'warning') &&
          (!g.focusedUid || g.items.find(x => x.uid === g.focusedUid)?.collapsed)) {
        g.focusedUid = it.uid; it.collapsed = false
      }
    } catch {
      it.status = 'error'
      it.error = { code: 'network', message: '影像服务连接失败，无法重试获取该份影像材料' }
    } finally { loading.value = false }
  }

  function applyLoadResult(it: StudyItem, result?: StudyLoadResult): ItemStatus {
    if (!result) {
      it.status = 'error'
      it.error = { code: 'bad_response', message: '服务端未返回该份影像的数据' }
      return 'error'
    }
    if (result.status === 'error' || !result.volumeData) {
      it.status = 'error'
      it.error = result.error ?? { code: 'unknown', message: '影像材料无法打开（未知原因）' }
      return 'error'
    }
    if (!isValidVolume(result.volumeData)) {
      it.status = 'error'
      it.error = { code: 'malformed', message: '影像数据结构异常：体数据维度与声明尺寸不一致，无法渲染' }
      return 'error'
    }
    const vd = result.volumeData
    // 载入成功：若之前保留的层位越界则夹回范围（尺寸异常材料也能安全浏览）
    const [d, h, w] = vd.dimensions
    it.view.mprSlice = {
      axial: Math.min(it.view.mprSlice.axial, d - 1),
      coronal: Math.min(it.view.mprSlice.coronal, h - 1),
      sagittal: Math.min(it.view.mprSlice.sagittal, w - 1),
    }
    it.volumeData = vd
    const finalStatus: ItemStatus = result.status === 'warning' ? 'warning' : 'ok'
    it.status = finalStatus
    it.warning = result.warnings?.[0] ?? ''
    return finalStatus
  }

  async function analyzeROI(rois?: ROIDef[]) {
    const it = focusedItem.value
    if (!it?.volumeData) return
    const defs = rois ?? it.view.roiDefs
    loading.value = true
    try {
      const { data } = await axios.post('/api/roi', { volume: it.volumeData.volume, rois: defs })
      it.view.roiResults = data.rois as ROIResult[]
    } finally { loading.value = false }
  }

  function applyWindow(w: number, l: number) {
    if (focusedItem.value) { focusedItem.value.view.windowVal = w; focusedItem.value.view.levelVal = l }
  }

  // ---------------- 会话持久化：顺序 / 收起 / 焦点 / 每份阅片状态 ----------------

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveSession, 300)
  }

  function saveSession() {
    const activeUid = activeGroup.value && !activeGroup.value.ephemeral ? activeGroup.value.uid : null
    const session: PersistedSession = {
      version: 1,
      activeGroupId: activeUid,
      groups: groups.value.filter(g => !g.ephemeral).map(g => ({
        uid: g.uid, name: g.name, focusedUid: g.focusedUid,
        items: g.items.map(i => ({
          uid: i.uid, studyId: i.studyId as string, name: i.name,
          collapsed: i.collapsed,
          // 测量结果由体数据算出，不持久化，恢复后保留 ROI 定义即可重新分析
          view: { ...i.view, roiResults: [] },
        })),
      })),
    }
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch { /* 配额不足时忽略 */ }
  }

  /** 重新进入页面：按上次的分组结构恢复（顺序、收起、焦点、阅片状态） */
  function restoreSession() {
    let raw: string | null = null
    try { raw = localStorage.getItem(SESSION_KEY) } catch { raw = null }
    if (!raw) return
    let saved: PersistedSession
    try { saved = JSON.parse(raw) } catch { return }
    if (!saved || saved.version !== 1 || !Array.isArray(saved.groups)) return

    groups.value = saved.groups
      .filter(g => Array.isArray(g.items) && g.items.length && g.items.every(i => typeof i.studyId === 'string'))
      .map(g => ({
        uid: g.uid, name: g.name, ephemeral: false,
        focusedUid: typeof g.focusedUid === 'string' ? g.focusedUid : null,
        items: g.items.map(i => ({
          uid: i.uid, studyId: i.studyId, name: i.name,
          status: 'loading' as ItemStatus, collapsed: !!i.collapsed,
          warning: '', error: null, volumeData: null,
          view: { ...defaultView(), ...(i.view ?? {}) },
        })),
      }))
    if (!groups.value.length) return
    activeGroupId.value = groups.value.some(g => g.uid === saved.activeGroupId)
      ? saved.activeGroupId : groups.value[0].uid
    // 重新批量拉取每一份体数据；单份成功失败各自独立
    for (const g of groups.value) void fillGroup(g)
  }

  return {
    loading, groups, activeGroupId, activeGroup, focusedItem,
    volumeData, preset, windowVal, levelVal, mprSlice, roiDefs, roiResults,
    setActiveGroup, focusStudy, toggleItemCollapse, dismissWarning, closeGroup,
    openStudyGroup, retryStudy, restoreSession, scheduleSave,
    loadVolume, analyzeROI, applyWindow,
  }
})

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import type {
  VolumeData, ROIResult, ROIDef, ViewState,
  ImageItem, StudyGroup, ExamOption, VolumeRequestPayload,
} from '@/types'

const STORAGE_KEY = 'imaging-viewer-session-v2'
/** 与后端保持一致的单维度上限，用于前端独立判定尺寸异常 */
const MAX_DIMENSION = 512
const DEFAULT_WINDOW = 80
const DEFAULT_LEVEL = 40

let seq = 0
function uid(prefix: string): string {
  seq += 1
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${seq}-${rand}`
}

function createDefaultView(width: number, height: number, depth: number): ViewState {
  return {
    windowVal: DEFAULT_WINDOW,
    levelVal: DEFAULT_LEVEL,
    mprSlice: { axial: Math.floor(depth / 2), coronal: Math.floor(height / 2), sagittal: Math.floor(width / 2) },
    roiDefs: [{ label: 'lesion1', center: [Math.round(width * 0.47), Math.round(height * 0.44), Math.round(depth / 2)], radius: 6 }],
    roiResults: [],
  }
}

/** 不依赖后端的前端兜底校验：返回异常原因，正常则为 null */
function validatePayload(req: VolumeRequestPayload, data: any): string | null {
  const dims = data?.dimensions
  if (!Array.isArray(dims) || dims.length !== 3 || dims.some((n: any) => typeof n !== 'number' || n <= 0)) {
    return '尺寸异常：响应缺少有效的三维尺寸信息，无法重建影像。'
  }
  const [d, h, w] = dims as number[]
  for (const [name, val] of ([['宽', w], ['高', h], ['深', d]] as const)) {
    if (val > MAX_DIMENSION) return `尺寸异常：${name}度为 ${val}，超过单维度上限 ${MAX_DIMENSION}，可能为导出错误。`
  }
  if (req.width !== w || req.height !== h || req.depth !== d) {
    return `尺寸异常：实际尺寸 ${d}×${h}×${w} 与申请尺寸 ${req.depth}×${req.height}×${req.width} 不一致。`
  }
  if (!Array.isArray(data.volume) || data.volume.length !== d) {
    return '材料损坏：体数据层数与声明的深度不一致，像素数据可能已截断。'
  }
  for (let z = 0; z < d; z++) {
    const plane = data.volume[z]
    if (!Array.isArray(plane) || plane.length !== h || !Array.isArray(plane[0]) || plane[0].length !== w) {
      return `材料损坏：第 ${z + 1} 层数据行列数与声明尺寸（${h}×${w}）不符，无法解析。`
    }
  }
  if (!data.mpr || !data.mpr.axial || !data.mpr.coronal || !data.mpr.sagittal) {
    return '材料损坏：缺少 MPR 切片数据（axial / coronal / sagittal）。'
  }
  return null
}

function errorMessage(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (err?.message) return `${fallback}（${err.message}）`
  return fallback
}

interface PersistedItem {
  id: string; name: string; modality: string
  request: VolumeRequestPayload; errorReason?: string
  collapsed: boolean; view: ViewState
}
interface PersistedGroup {
  id: string; name: string; focusedItemId: string; items: PersistedItem[]
}
interface SessionSnapshot {
  version: number
  groups: PersistedGroup[]
  activeGroupId: string
  preset: string
}

export const useImagingStore = defineStore('imaging', () => {
  // ---- 全局/兼容状态 ----
  const loading = ref(false)          // 单份载入与 ROI 分析（沿用原语义）
  const groupLoading = ref(false)     // 成组打开进行中
  const preset = ref('brain')         // 顶部单份载入使用的预设

  // ---- 分组状态 ----
  const groups = ref<StudyGroup[]>([])
  const activeGroupId = ref('')

  const activeGroup = computed<StudyGroup | null>(
    () => groups.value.find(g => g.id === activeGroupId.value) ?? null
  )
  const focusedItem = computed<ImageItem | null>(() => {
    const g = activeGroup.value
    if (!g) return null
    return g.items.find(i => i.id === g.focusedItemId) ?? g.items[0] ?? null
  })
  const focusedView = computed<ViewState | null>(() =>
    focusedItem.value && focusedItem.value.status === 'ready' ? focusedItem.value.view : null
  )

  // ---- 向后兼容代理：组件无需感知分组，始终操作"当前聚焦的一份" ----
  const volumeData = computed<VolumeData | null>(() => focusedItem.value?.volumeData ?? null)
  const roiResults = computed<ROIResult[]>(() => focusedView.value?.roiResults ?? [])

  const windowVal = computed<number>({
    get: () => focusedView.value?.windowVal ?? DEFAULT_WINDOW,
    set: v => { if (focusedView.value) focusedView.value.windowVal = v },
  })
  const levelVal = computed<number>({
    get: () => focusedView.value?.levelVal ?? DEFAULT_LEVEL,
    set: v => { if (focusedView.value) focusedView.value.levelVal = v },
  })
  const mprSlice = computed({
    get: () => focusedView.value?.mprSlice ?? { axial: 32, coronal: 32, sagittal: 32 },
    set: v => { if (focusedView.value) Object.assign(focusedView.value.mprSlice, v) },
  })
  const roiDefs = computed<ROIDef[]>({
    get: () => focusedView.value?.roiDefs ?? [],
    set: list => { if (focusedView.value) focusedView.value.roiDefs = list },
  })

  // ---- 单份影像加载（原入口，内部按单元素分组走同一套流程） ----
  async function loadVolume() {
    const option: ExamOption = {
      id: `solo-${preset.value}`,
      name: { brain: '头部CT', chest: '胸部CT', abdomen: '腹部CT' }[preset.value] ?? '影像',
      modality: 'CT',
      request: { preset: preset.value, width: 64, height: 64, depth: 64 },
    }
    await openGroup([option])
  }

  // ---- 成组打开：多选检查一次性成组，组内各份独立并行加载 ----
  async function openGroup(exams: ExamOption[]): Promise<string> {
    if (!exams.length) return ''
    groupLoading.value = true
    const group: StudyGroup = {
      id: uid('grp'),
      name: exams.length === 1 ? exams[0].name : `检查组 ${groups.value.length + 1}`,
      items: exams.map(exam => ({
        id: uid('img'),
        name: exam.name,
        modality: exam.modality,
        request: { ...exam.request },
        status: 'loading',
        collapsed: false,
        view: createDefaultView(exam.request.width, exam.request.height, exam.request.depth),
      })),
      focusedItemId: '',
    }
    group.focusedItemId = group.items[0].id
    groups.value.push(group)
    activeGroupId.value = group.id

    // 一份失败只标记这一份，不影响 Promise 链上其它影像
    await Promise.all(group.items.map(item => loadItem(item)))
    groupLoading.value = false
    return group.id
  }

  // ---- 单份加载（含损坏/尺寸异常隔离） ----
  async function loadItem(item: ImageItem) {
    item.status = 'loading'
    item.errorReason = undefined
    try {
      const { data } = await axios.post('/api/volume', item.request)
      const reason = validatePayload(item.request, data)
      if (reason) {
        item.status = 'error'
        item.errorReason = reason
        item.volumeData = undefined
        return
      }
      item.volumeData = data as VolumeData
      // 把可能越界的 MPR 切片位置夹回有效范围（持久化恢复或尺寸不同时）
      const [d, h, w] = data.dimensions
      const ms = item.view.mprSlice
      ms.axial = Math.min(Math.max(0, ms.axial), d - 1)
      ms.coronal = Math.min(Math.max(0, ms.coronal), h - 1)
      ms.sagittal = Math.min(Math.max(0, ms.sagittal), w - 1)
      item.status = 'ready'
    } catch (err: any) {
      item.status = 'error'
      item.errorReason = errorMessage(err, '该份影像无法载入')
      item.volumeData = undefined
    }
  }

  // ---- 组内切换聚焦（并展开该份），组间切换只改激活组；顺序与各自聚焦项都保留 ----
  function focusItem(groupId: string, itemId: string) {
    const g = groups.value.find(x => x.id === groupId)
    if (!g || !g.items.some(i => i.id === itemId)) return
    activeGroupId.value = groupId
    g.focusedItemId = itemId
    const item = g.items.find(i => i.id === itemId)
    if (item) item.collapsed = false
  }

  function switchGroup(groupId: string) {
    if (groups.value.some(g => g.id === groupId)) activeGroupId.value = groupId
  }

  // ---- 组内逐条收起/展开（不改变聚焦） ----
  function toggleItemCollapse(groupId: string, itemId: string) {
    const item = groups.value.find(g => g.id === groupId)?.items.find(i => i.id === itemId)
    if (item && item.status === 'ready') item.collapsed = !item.collapsed
  }

  // ---- 整组关闭：聚焦到相邻组，组顺序本身不变 ----
  function closeGroup(groupId: string) {
    const idx = groups.value.findIndex(g => g.id === groupId)
    if (idx === -1) return
    groups.value.splice(idx, 1)
    if (activeGroupId.value === groupId) {
      activeGroupId.value = groups.value[idx]?.id ?? groups.value[idx - 1]?.id ?? ''
    }
  }

  // ---- 异常单份重试（只重新加载这一份） ----
  function retryItem(groupId: string, itemId: string) {
    const item = groups.value.find(g => g.id === groupId)?.items.find(i => i.id === itemId)
    if (item) void loadItem(item)
  }

  // ---- ROI 测量：作用于当前聚焦的一份，结果按份保留 ----
  async function analyzeROI(rois: ROIDef[]) {
    const item = focusedItem.value
    if (!item || !item.volumeData) return
    loading.value = true
    try {
      const { data } = await axios.post('/api/roi', { volume: item.volumeData.volume, rois })
      item.view.roiResults = data.rois
    } finally {
      loading.value = false
    }
  }

  function applyWindow(w: number, l: number) {
    if (focusedView.value) {
      focusedView.value.windowVal = w
      focusedView.value.levelVal = l
    }
  }

  // ================= 会话持久化（重新进入页面按上次分组恢复） =================
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function persist() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        const snapshot: SessionSnapshot = {
          version: 2,
          activeGroupId: activeGroupId.value,
          preset: preset.value,
          groups: groups.value.map(g => ({
            id: g.id,
            name: g.name,
            focusedItemId: g.focusedItemId,
            items: g.items.map(i => ({
              id: i.id,
              name: i.name,
              modality: i.modality,
              request: i.request,
              errorReason: i.errorReason,
              collapsed: i.collapsed,
              // 仅持久化阅片状态，不持久化大体素数据，恢复时重新拉取
              view: JSON.parse(JSON.stringify(i.view)),
            })),
          })),
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
      } catch {
        /* localStorage 不可用时静默降级为会话内记忆 */
      }
    }, 300)
  }

  function restore() {
    let snapshot: SessionSnapshot | null = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) snapshot = JSON.parse(raw) as SessionSnapshot
    } catch {
      snapshot = null
    }
    if (!snapshot || snapshot.version !== 2 || !Array.isArray(snapshot.groups)) return

    preset.value = snapshot.preset ?? 'brain'
    groups.value = snapshot.groups.map(g => ({
      id: g.id,
      name: g.name,
      focusedItemId: g.focusedItemId,
      items: g.items.map(i => ({
        ...i,
        status: 'loading' as const,   // 体数据不落盘，恢复时重新逐份加载
        volumeData: undefined,
        view: {
          ...i.view,
          mprSlice: { ...i.view.mprSlice },
          roiDefs: i.view.roiDefs ?? [],
          roiResults: i.view.roiResults ?? [],
        },
      })),
    }))
    activeGroupId.value = snapshot.activeGroupId && groups.value.some(g => g.id === snapshot!.activeGroupId)
      ? snapshot.activeGroupId
      : (groups.value[0]?.id ?? '')

    // 逐份恢复加载，单份失败仍只标记自己
    for (const g of groups.value) {
      for (const item of g.items) void loadItem(item)
    }
  }

  restore()

  return {
    // 状态
    loading, groupLoading, preset, groups, activeGroupId,
    // 派生
    activeGroup, focusedItem, volumeData, roiResults,
    windowVal, levelVal, mprSlice, roiDefs,
    // 动作
    loadVolume, openGroup, loadItem, focusItem, switchGroup,
    toggleItemCollapse, closeGroup, retryItem, analyzeROI, applyWindow, persist,
  }
})

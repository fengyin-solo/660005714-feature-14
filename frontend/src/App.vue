<template>
  <div class="app-root">
    <header class="top-bar">
      <h1>🩻 三维医学影像体渲染与ROI标注平台</h1>
      <div class="tools">
        <el-select v-model="store.preset" size="small" style="width:120px">
          <el-option value="brain" label="头部CT"/><el-option value="chest" label="胸部CT"/><el-option value="abdomen" label="腹部CT"/>
        </el-select>
        <el-button size="small" @click="store.loadVolume()" :loading="store.loading">载入影像</el-button>
        <el-button size="small" type="primary" @click="dialogVisible = true">🗂️ 多选检查成组打开</el-button>
        <span v-if="store.volumeData" class="dim-info">{{ store.volumeData.dimensions.join('×') }}</span>
      </div>
    </header>

    <GroupTabs v-if="store.groups.length" />
    <StudyItemBar />

    <!-- 尺寸异常但可查看：仅提示当前这一份 -->
    <div v-if="focused && focused.status === 'warning' && focused.warning" class="warn-banner">
      <span>⚠️ {{ focused.name }}：{{ focused.warning }}</span>
      <el-button size="small" text @click="store.dismissWarning(focused.uid)">知道了</el-button>
    </div>

    <div class="main-grid" v-if="store.volumeData && focused && !focused.collapsed">
      <div class="render-area"><VolumeRenderer /></div>
      <div class="mpr-area">
        <div class="mpr-row">
          <div class="mpr-panel"><div class="mpr-title">横断面 (轴位)</div><MPRView plane="axial" /></div>
          <div class="mpr-panel"><div class="mpr-title">冠状面</div><MPRView plane="coronal" /></div>
          <div class="mpr-panel"><div class="mpr-title">矢状面</div><MPRView plane="sagittal" /></div>
        </div>
        <WindowControl />
        <ROIPanel />
      </div>
    </div>

    <!-- 当前聚焦份损坏：只标出这一份并说明原因，同组其它影像不受影响 -->
    <div v-else-if="focused && focused.status === 'error'" class="state-wrap">
      <div class="error-card">
        <div class="error-icon">❌</div>
        <div class="error-title">{{ focused.name }}</div>
        <div class="error-reason">{{ focused.error?.message }}</div>
        <div class="error-code" v-if="focused.error">错误码：{{ focused.error.code }}</div>
        <el-button size="small" type="primary" :loading="store.loading" @click="store.retryStudy(focused.uid)">
          重新载入这份
        </el-button>
        <div class="error-hint">该材料已从本组标出，组内其它影像可正常切换查看与测量</div>
      </div>
    </div>

    <!-- 组内可见份全部收起 / 仍在载入 -->
    <div v-else-if="store.activeGroup" class="state-wrap">
      <div class="placeholder">
        <template v-if="allLoading">正在载入本组影像…</template>
        <template v-else>本组影像均已收起，可在上方条目中点击任意一份展开</template>
      </div>
    </div>

    <div class="loading-state" v-else-if="!store.loading">
      <div class="placeholder">点击"多选检查成组打开"选择多份检查，或使用"载入影像"打开单份</div>
    </div>

    <OpenStudyDialog v-model="dialogVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import VolumeRenderer from './components/VolumeRenderer.vue'
import MPRView from './components/MPRView.vue'
import WindowControl from './components/WindowControl.vue'
import ROIPanel from './components/ROIPanel.vue'
import GroupTabs from './components/GroupTabs.vue'
import StudyItemBar from './components/StudyItemBar.vue'
import OpenStudyDialog from './components/OpenStudyDialog.vue'
import { useImagingStore } from './store/imaging'

const store = useImagingStore()
const dialogVisible = ref(false)
const focused = computed(() => store.focusedItem)
const allLoading = computed(() => {
  const g = store.activeGroup
  return !!g && g.items.every(i => i.status === 'loading')
})

onMounted(() => store.restoreSession())

// 任意分组/组内状态变化都落盘：顺序、收起、焦点、每份阅片状态
watch(
  () => store.groups.map(g => [
    g.uid, g.name, g.ephemeral, g.focusedUid,
    g.items.map(i => [i.uid, i.studyId, i.name, i.collapsed, i.status, i.view]),
  ]),
  () => store.scheduleSave(),
  { deep: true },
)
watch(() => store.activeGroupId, () => store.scheduleSave())
</script>

<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0d1117;color:#c9d1d9}
.app-root{min-height:100vh}
.top-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;background:#161b22;border-bottom:1px solid #30363d}
.top-bar h1{font-size:1rem;color:#58a6ff}
.tools{display:flex;gap:8px;align-items:center}
.dim-info{font-size:11px;color:#8b949e;font-family:monospace}
.loading-state{display:flex;align-items:center;justify-content:center;height:50vh}
.placeholder{color:#484f58;font-size:14px}
.state-wrap{display:flex;align-items:center;justify-content:center;padding:40px 20px}
.warn-banner{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 20px;background:#2d2410;border-bottom:1px solid #7d5f1e;color:#e3b341;font-size:12px}
.error-card{max-width:480px;text-align:center;background:#161b22;border:1px solid #6e2a2a;border-radius:8px;padding:28px}
.error-icon{font-size:34px;margin-bottom:10px}
.error-title{font-size:15px;color:#f85149;font-weight:600;margin-bottom:8px}
.error-reason{font-size:12px;color:#c9d1d9;line-height:1.6;margin-bottom:8px}
.error-code{font-size:10px;color:#8b949e;font-family:monospace;margin-bottom:14px}
.error-hint{font-size:11px;color:#8b949e;margin-top:12px}
.main-grid{display:grid;grid-template-columns:1fr 480px;gap:12px;padding:12px 20px;min-height:85vh}
.render-area{background:#0d1117;border-radius:8px;border:1px solid #30363d;overflow:hidden}
.mpr-area{display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.mpr-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.mpr-panel{background:#161b22;border-radius:6px;border:1px solid #30363d;overflow:hidden}
.mpr-title{font-size:10px;color:#8b949e;padding:4px 6px;background:#0d1117;text-align:center}
</style>

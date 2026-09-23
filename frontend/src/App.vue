<template>
  <div class="app-root">
    <header class="top-bar">
      <h1>🩻 三维医学影像体渲染与ROI标注平台</h1>
      <div class="tools">
        <!-- 单份阅片入口（保持原有流程） -->
        <el-select v-model="store.preset" size="small" style="width:110px" @change="schedulePersist">
          <el-option value="brain" label="头部CT"/><el-option value="chest" label="胸部CT"/><el-option value="abdomen" label="腹部CT"/>
        </el-select>
        <el-button size="small" @click="store.loadVolume()" :loading="store.groupLoading || store.loading">载入影像</el-button>

        <el-divider direction="vertical" />

        <!-- 多选检查 → 成组打开 -->
        <el-select
          v-model="selectedExamIds"
          size="small"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="多选检查成组打开"
          style="width:230px"
        >
          <el-option
            v-for="e in examCatalog"
            :key="e.id"
            :value="e.id"
            :label="e.name"
          />
        </el-select>
        <el-button
          size="small"
          type="primary"
          :disabled="!selectedExamIds.length"
          :loading="store.groupLoading"
          @click="openSelected"
        >成组打开 ({{ selectedExamIds.length }})</el-button>
      </div>
    </header>

    <!-- 顶部按组切换 -->
    <GroupTabs v-if="store.groups.length" />

    <!-- 正常阅片主区域 -->
    <div
      v-if="store.volumeData && store.focusedItem && !store.focusedItem.collapsed"
      class="main-grid"
    >
      <div class="render-area">
        <div class="viewer-caption">{{ store.focusedItem.name }} · {{ store.volumeData.dimensions.join('×') }}</div>
        <VolumeRenderer />
      </div>
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

    <!-- 当前聚焦份异常或已收起 -->
    <ItemStateCard
      v-else-if="store.activeGroup && store.focusedItem"
      :item="store.focusedItem"
      :group-id="store.activeGroup.id"
    />

    <!-- 初始空态 -->
    <div class="loading-state" v-else-if="!store.groupLoading">
      <div class="placeholder">选择预设"载入影像"进行单份阅片，或多选检查后"成组打开"</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import VolumeRenderer from './components/VolumeRenderer.vue'
import MPRView from './components/MPRView.vue'
import WindowControl from './components/WindowControl.vue'
import ROIPanel from './components/ROIPanel.vue'
import GroupTabs from './components/GroupTabs.vue'
import ItemStateCard from './components/ItemStateCard.vue'
import { useImagingStore } from './store/imaging'
import { EXAM_CATALOG, findExam } from './config/exams'

const store = useImagingStore()
const examCatalog = EXAM_CATALOG
const selectedExamIds = ref<string[]>([])

async function openSelected() {
  const exams = selectedExamIds.value.map(id => findExam(id)).filter(Boolean) as typeof EXAM_CATALOG
  await store.openGroup(exams)
  selectedExamIds.value = []
  store.persist()
}

// 结构变化（开关组/切换/收起）与各份阅片状态变化均持久化
function schedulePersist() { store.persist() }
watch(() => store.groups, schedulePersist, { deep: true })
watch(() => store.activeGroupId, schedulePersist)
</script>

<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0d1117;color:#c9d1d9}
.app-root{min-height:100vh}
.top-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;background:#161b22;border-bottom:1px solid #30363d}
.top-bar h1{font-size:1rem;color:#58a6ff}
.tools{display:flex;gap:8px;align-items:center}
.loading-state{display:flex;align-items:center;justify-content:center;height:50vh}
.placeholder{color:#484f58;font-size:14px}
.main-grid{display:grid;grid-template-columns:1fr 480px;gap:12px;padding:12px 20px;min-height:85vh}
.render-area{position:relative;background:#0d1117;border-radius:8px;border:1px solid #30363d;overflow:hidden}
.viewer-caption{position:absolute;top:6px;left:10px;z-index:2;font-size:11px;color:#8b949e;background:#161b22cc;padding:2px 8px;border-radius:10px;pointer-events:none}
.mpr-area{display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.mpr-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.mpr-panel{background:#161b22;border-radius:6px;border:1px solid #30363d;overflow:hidden}
.mpr-title{font-size:10px;color:#8b949e;padding:4px 6px;background:#0d1117;text-align:center}
</style>

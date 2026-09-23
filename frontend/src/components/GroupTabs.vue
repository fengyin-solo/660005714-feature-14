<template>
  <div class="group-tabs">
    <div
      v-for="g in store.groups"
      :key="g.id"
      class="group-tab"
      :class="{ active: g.id === store.activeGroupId }"
    >
      <button class="tab-head" :title="g.name" @click="store.switchGroup(g.id)">
        <span class="tab-name">{{ g.name }}</span>
        <span class="tab-badge">{{ readyCount(g) }}/{{ g.items.length }}</span>
        <span
          v-if="errorCount(g)"
          class="tab-warn"
          :title="`${errorCount(g)} 份材料异常`"
        >⚠ {{ errorCount(g) }}</span>
        <span class="tab-close" title="整组关闭" @click.stop="store.closeGroup(g.id)">✕</span>
      </button>

      <!-- 组内条目：切换聚焦 / 逐条收起 -->
      <div v-if="g.id === store.activeGroupId" class="item-strip">
        <div
          v-for="i in g.items"
          :key="i.id"
          class="item-chip"
          :class="chipClass(g, i)"
          @click="store.focusItem(g.id, i.id)"
        >
          <span class="chip-status">
            <span v-if="i.status === 'loading'" class="dot dot-loading" title="加载中"></span>
            <span v-else-if="i.status === 'error'" class="dot dot-error" title="异常"></span>
            <span v-else class="dot dot-ready" title="正常"></span>
          </span>
          <span class="chip-name">{{ i.name }}</span>
          <span
            v-if="i.status === 'ready'"
            class="chip-collapse"
            :title="i.collapsed ? '展开这一份' : '收起这一份'"
            @click.stop="store.toggleItemCollapse(g.id, i.id)"
          >{{ i.collapsed ? '▸' : '▾' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useImagingStore } from '../store/imaging'
import type { ImageItem, StudyGroup } from '@/types'

const store = useImagingStore()

function readyCount(g: StudyGroup): number {
  return g.items.filter(i => i.status === 'ready').length
}
function errorCount(g: StudyGroup): number {
  return g.items.filter(i => i.status === 'error').length
}
function chipClass(g: StudyGroup, i: ImageItem): Record<string, boolean> {
  return {
    focused: g.focusedItemId === i.id,
    errored: i.status === 'error',
    collapsed: i.collapsed,
  }
}
</script>

<style scoped>
.group-tabs { display: flex; align-items: stretch; gap: 4px; padding: 6px 12px 0; background: #0d1117; border-bottom: 1px solid #30363d; overflow-x: auto }
.group-tab { display: flex; flex-direction: column; justify-content: flex-end; min-width: 0 }
.tab-head {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  background: #161b22; border: 1px solid #30363d; border-bottom: none;
  border-radius: 6px 6px 0 0; color: #8b949e; cursor: pointer; font-size: 12px;
  white-space: nowrap; max-width: 260px;
}
.group-tab.active .tab-head { background: #0d1117; color: #e6edf3; border-color: #58a6ff; }
.tab-name { overflow: hidden; text-overflow: ellipsis; max-width: 150px }
.tab-badge { font-size: 10px; color: #8b949e; font-family: monospace }
.tab-warn { font-size: 10px; color: #f0883e }
.tab-close { margin-left: 4px; color: #484f58; border-radius: 3px; padding: 0 3px; font-size: 11px }
.tab-close:hover { color: #f85149; background: #21262d }
.item-strip { display: flex; gap: 4px; padding: 0 0 0 8px; height: 28px }
.item-chip {
  display: flex; align-items: center; gap: 5px; padding: 3px 8px; margin-bottom: -1px;
  background: #161b22; border: 1px solid #30363d; border-bottom: none;
  border-radius: 5px 5px 0 0; cursor: pointer; font-size: 11px; color: #8b949e;
  max-width: 200px;
}
.item-chip.focused { background: #0d1117; color: #e6edf3; border-color: #58a6ff; border-bottom-color: #0d1117 }
.item-chip.errored:not(.focused) { border-color: #f0883e55; color: #f0883e }
.item-chip.collapsed { opacity: 0.75 }
.chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px }
.chip-collapse { color: #58a6ff; font-size: 10px; padding: 0 2px }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50% }
.dot-ready { background: #3fb950 }
.dot-error { background: #f85149 }
.dot-loading { background: #d29922; animation: pulse 1s infinite }
@keyframes pulse { 50% { opacity: 0.3 } }
</style>

<template>
  <div class="group-tabs">
    <button
      v-for="g in store.groups" :key="g.uid"
      class="group-tab" :class="{ active: g.uid === store.activeGroup?.uid }"
      :title="g.name" @click="store.setActiveGroup(g.uid)">
      <span class="tab-name">📁 {{ g.name }}</span>
      <span class="tab-count">{{ okCount(g) }}/{{ g.items.length }}</span>
      <span class="tab-close" title="整组关闭" @click.stop="store.closeGroup(g.uid)">✕</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useImagingStore } from '../store/imaging'
import type { StudyGroup } from '@/types'
const store = useImagingStore()
function okCount(g: StudyGroup) {
  return g.items.filter(i => i.status === 'ok' || i.status === 'warning').length
}
</script>

<style scoped>
.group-tabs { display: flex; gap: 6px; padding: 6px 20px 0; background: #161b22; border-bottom: 1px solid #30363d; overflow-x: auto }
.group-tab {
  display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
  padding: 6px 10px; border: 1px solid #30363d; border-bottom: none;
  border-radius: 6px 6px 0 0; background: #0d1117; color: #8b949e;
  font-size: 12px; cursor: pointer; max-width: 260px;
}
.group-tab:hover { color: #c9d1d9 }
.group-tab.active { background: #0d1117; color: #58a6ff; border-color: #58a6ff; font-weight: 600 }
.tab-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.tab-count { font-size: 10px; color: #8b949e; font-family: monospace }
.tab-close { padding: 0 3px; border-radius: 3px; font-size: 10px; color: #8b949e }
.tab-close:hover { background: #da3633; color: #fff }
</style>

<template>
  <div class="item-bar" v-if="group">
    <div class="bar-label">本组 {{ group.items.length }} 份</div>
    <div class="chips">
      <div
        v-for="(it, idx) in group.items" :key="it.uid"
        class="chip" :class="[it.status, { focused: it.uid === group.focusedUid, collapsed: it.collapsed }]"
        @click="store.focusStudy(it.uid)">
        <span class="chip-status" :title="statusTitle(it)">
          <template v-if="it.status === 'loading'">⏳</template>
          <template v-else-if="it.status === 'ok'">✅</template>
          <template v-else-if="it.status === 'warning'">⚠️</template>
          <template v-else>❌</template>
        </span>
        <span class="chip-index">{{ idx + 1 }}</span>
        <span class="chip-name" :title="it.name">{{ it.name }}</span>
        <span class="chip-dim" v-if="it.volumeData">{{ it.volumeData.dimensions.join('×') }}</span>
        <button
          class="chip-collapse" :title="it.collapsed ? '展开这份' : '逐条收起这份'"
          @click.stop="store.toggleItemCollapse(it.uid)">
          {{ it.collapsed ? '▸' : '▾' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useImagingStore } from '../store/imaging'
import type { StudyItem } from '@/types'

const store = useImagingStore()
const group = computed(() => store.activeGroup)

function statusTitle(it: StudyItem) {
  if (it.status === 'loading') return '正在载入…'
  if (it.status === 'error' && it.error) return it.error.message
  if (it.status === 'warning' && it.warning) return it.warning
  if (it.status === 'ok') return '影像正常'
  return ''
}
</script>

<style scoped>
.item-bar { display: flex; align-items: center; gap: 10px; padding: 6px 20px; background: #161b22; border-bottom: 1px solid #30363d }
.bar-label { font-size: 11px; color: #8b949e; white-space: nowrap }
.chips { display: flex; gap: 6px; overflow-x: auto; flex: 1 }
.chip {
  display: flex; align-items: center; gap: 5px; flex: 0 0 auto;
  padding: 3px 6px 3px 8px; border: 1px solid #30363d; border-radius: 14px;
  background: #0d1117; font-size: 11px; color: #c9d1d9; cursor: pointer;
  max-width: 300px; user-select: none;
}
.chip:hover { border-color: #58a6ff }
.chip.focused { border-color: #58a6ff; box-shadow: 0 0 0 1px #58a6ff inset }
.chip.collapsed { opacity: 0.55 }
.chip.error { border-color: #6e2a2a }
.chip.error.focused { box-shadow: 0 0 0 1px #f85149 inset; border-color: #f85149 }
.chip.warning { border-color: #7d5f1e }
.chip.warning.focused { box-shadow: 0 0 0 1px #d29922 inset; border-color: #d29922 }
.chip-index { color: #8b949e; font-family: monospace; font-size: 10px }
.chip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.chip-dim { color: #8b949e; font-family: monospace; font-size: 10px }
.chip-collapse {
  border: none; background: transparent; color: #8b949e; cursor: pointer;
  font-size: 10px; padding: 0 2px; line-height: 1;
}
.chip-collapse:hover { color: #c9d1d9 }
</style>

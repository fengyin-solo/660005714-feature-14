<template>
  <div class="state-wrap">
    <!-- 材料损坏 / 尺寸异常：仅这一份被标出，组内其它影像不受影响 -->
    <div v-if="item.status === 'error'" class="state-card error-card">
      <div class="state-icon">⚠️</div>
      <div class="state-title">「{{ item.name }}」无法显示</div>
      <div class="state-reason">{{ item.errorReason || '未知原因' }}</div>
      <div class="state-hint">该份材料已被单独标记，同组其它影像可正常切换查看。</div>
      <el-button size="small" type="primary" @click="store.retryItem(groupId, item.id)">重新加载这一份</el-button>
    </div>

    <!-- 加载中（成组打开/页面恢复时各份独立并行加载） -->
    <div v-else-if="item.status === 'loading'" class="state-card loading-card">
      <div class="state-icon">⏳</div>
      <div class="state-title">正在载入「{{ item.name }}」…</div>
    </div>

    <!-- 组内逐条收起 -->
    <div v-else-if="item.collapsed" class="state-card collapsed-card">
      <div class="state-icon">▸</div>
      <div class="state-title">「{{ item.name }}」已收起</div>
      <div class="state-hint">阅片位置与测量结果已保留，展开后可继续。</div>
      <el-button size="small" @click="store.focusItem(groupId, item.id)">展开这一份</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ImageItem } from '@/types'
import { useImagingStore } from '../store/imaging'

defineProps<{ item: ImageItem; groupId: string }>()
const store = useImagingStore()
</script>

<style scoped>
.state-wrap { display: flex; align-items: center; justify-content: center; min-height: 60vh; padding: 24px }
.state-card {
  max-width: 460px; width: 100%; text-align: center; padding: 28px 24px;
  background: #161b22; border-radius: 10px; border: 1px solid #30363d;
}
.error-card { border-color: #f0883e66 }
.state-icon { font-size: 34px; margin-bottom: 10px }
.state-title { font-size: 15px; color: #e6edf3; font-weight: 600; margin-bottom: 8px }
.state-reason {
  font-size: 12px; color: #f0883e; line-height: 1.7; margin-bottom: 8px;
  background: #0d1117; border-radius: 6px; padding: 8px 10px; text-align: left;
}
.state-hint { font-size: 11px; color: #8b949e; margin-bottom: 14px; line-height: 1.6 }
</style>

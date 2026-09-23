<template>
  <el-dialog
    :model-value="modelValue" title="多选检查成组打开" width="640px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="reload">
    <div class="dialog-toolbar">
      <el-button size="small" :loading="loading" @click="reload">刷新检查目录</el-button>
      <span class="hint">勾选需要的检查（可跨患者多选），作为一个组在顶部打开</span>
    </div>
    <el-table
      ref="tableRef" :data="studies" height="320px" size="small" class="study-table"
      @selection-change="onSelectionChange" @row-click="onRowClick">
      <el-table-column type="selection" width="42" />
      <el-table-column prop="studyId" label="检查号" width="130" />
      <el-table-column prop="patientName" label="患者" width="90" />
      <el-table-column prop="modality" label="模态" width="60" />
      <el-table-column prop="bodyPart" label="部位" />
      <el-table-column prop="studyDate" label="检查日期" width="110" />
    </el-table>
    <div class="name-row">
      <span>组名</span>
      <el-input v-model="groupName" size="small" placeholder="可选，默认自动命名" />
    </div>
    <template #footer>
      <span class="selected-count">已选 {{ selected.length }} 份</span>
      <el-button size="small" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        size="small" type="primary" :loading="loading || opening"
        :disabled="!selected.length" @click="confirm">成组打开</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useImagingStore } from '../store/imaging'
import type { StudyInfo } from '@/types'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const store = useImagingStore()
const studies = ref<StudyInfo[]>([])
const selected = ref<StudyInfo[]>([])
const groupName = ref('')
const loading = ref(false)
const opening = ref(false)
const tableRef = ref<any>(null)

async function reload() {
  loading.value = true
  try {
    const { data } = await axios.get('/api/studies')
    studies.value = data.studies
  } catch {
    ElMessage.error('检查目录获取失败，请确认影像服务可用')
  } finally { loading.value = false }
}

function onSelectionChange(rows: StudyInfo[]) { selected.value = rows }
function onRowClick(row: StudyInfo, column: any) {
  if (column?.type === 'selection') return // 复选框自身已处理，避免双重切换
  tableRef.value?.toggleRowSelection(row)
}

async function confirm() {
  if (!selected.value.length) return
  opening.value = true
  const name = groupName.value.trim()
    || `检查组 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
  try {
    await store.openStudyGroup([...selected.value], name)
    tableRef.value?.clearSelection()
    selected.value = []
    emit('update:modelValue', false)
    groupName.value = ''
  } finally { opening.value = false }
}
</script>

<style scoped>
.dialog-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px }
.hint { font-size: 11px; color: #8b949e }
.study-table { background: transparent }
.name-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; color: #c9d1d9 }
.selected-count { font-size: 11px; color: #8b949e; margin-right: auto }
:deep(.el-dialog__footer) { display: flex; align-items: center; gap: 8px }
</style>

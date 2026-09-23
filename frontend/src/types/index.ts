export interface WindowPreset { window: number; level: number; desc: string }
export interface VolumeData {
  volume: number[][][]
  dimensions: [number, number, number]
  mpr: { axial: number[][]; coronal: number[][]; sagittal: number[][] }
  preset: string
  windowPresets: Record<string, WindowPreset>
}

export interface ROIResult {
  label: string; center: number[]; radius: number
  mean: number; std: number; min: number; max: number; voxelCount: number
  histogram: number[]
}

export interface ROIDef { label: string; center: number[]; radius: number }

/** 检查登记信息（PACS 目录） */
export interface StudyInfo {
  studyId: string
  patientName: string
  modality: string
  bodyPart: string
  studyDate: string
}

export type ItemStatus = 'loading' | 'ok' | 'warning' | 'error'

export interface ItemError { code: string; message: string }

/** 每份检查各自保留的阅片/测量状态 */
export interface ItemViewState {
  windowVal: number
  levelVal: number
  mprSlice: { axial: number; coronal: number; sagittal: number }
  roiDefs: ROIDef[]
  roiResults: ROIResult[]
}

/** 组内的一份影像材料 */
export interface StudyItem {
  uid: string
  studyId: string | null        // 旧版"载入影像"生成的临时影像为 null（不持久化）
  name: string
  meta?: StudyInfo
  status: ItemStatus
  collapsed: boolean
  warning: string
  error: ItemError | null
  volumeData: VolumeData | null
  view: ItemViewState
}

/** 一次多选检查打开的检查分组 */
export interface StudyGroup {
  uid: string
  name: string
  ephemeral: boolean            // 旧版单份载入产生的组：不参与恢复
  items: StudyItem[]
  focusedUid: string | null
}

/** /api/studies/load 单份返回 */
export interface StudyLoadResult {
  studyId: string
  status: Exclude<ItemStatus, 'loading'>
  error: ItemError | null
  warnings: string[]
  volumeData: VolumeData | null
}

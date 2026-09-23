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

/** 单次阅片流程的状态，按影像逐份保留 */
export interface ViewState {
  windowVal: number
  levelVal: number
  mprSlice: { axial: number; coronal: number; sagittal: number }
  roiDefs: ROIDef[]
  roiResults: ROIResult[]
}

export interface ROIDef { label: string; center: number[]; radius: number }

/** 组内一份影像的加载状态 */
export type ImageStatus = 'loading' | 'ready' | 'error'

export interface ImageItem {
  id: string
  name: string
  modality: string
  request: VolumeRequestPayload
  status: ImageStatus
  errorReason?: string
  collapsed: boolean
  volumeData?: VolumeData
  view: ViewState
}

/** 一次多选检查打开的分组 */
export interface StudyGroup {
  id: string
  name: string
  items: ImageItem[]
  focusedItemId: string
}

export interface VolumeRequestPayload {
  preset: string
  width: number
  height: number
  depth: number
  corrupt?: string
}

/** 可选检查目录（成组打开时多选） */
export interface ExamOption {
  id: string
  name: string
  modality: string
  request: VolumeRequestPayload
}

/**
 * 成组打开时的可选检查列表。
 * 前三项为常规可正常解析的影像，后两项分别模拟材料损坏与尺寸异常，
 * 用于验证异常只标记到单份影像、不影响同组其它材料。
 */
export const EXAM_CATALOG = [
    {
        id: 'head-ct',
        name: '头部CT（脑窗）',
        modality: 'CT',
        request: { preset: 'brain', width: 64, height: 64, depth: 64 },
    },
    {
        id: 'chest-ct',
        name: '胸部CT（肺窗）',
        modality: 'CT',
        request: { preset: 'chest', width: 64, height: 64, depth: 64 },
    },
    {
        id: 'abdomen-ct',
        name: '腹部CT（腹窗）',
        modality: 'CT',
        request: { preset: 'abdomen', width: 64, height: 64, depth: 64 },
    },
    {
        id: 'corrupt-dcm',
        name: '颈部CT（文件损坏样例）',
        modality: 'CT',
        request: { preset: 'brain', width: 64, height: 64, depth: 64, corrupt: 'truncated' },
    },
    {
        id: 'oversized-ct',
        name: '盆腔CT（尺寸异常样例）',
        modality: 'CT',
        request: { preset: 'abdomen', width: 768, height: 64, depth: 64 },
    },
];
export function findExam(id) {
    return EXAM_CATALOG.find(e => e.id === id);
}

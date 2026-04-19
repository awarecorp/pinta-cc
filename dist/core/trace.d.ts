import type { PintaConfig } from "./config.js";
export declare class TraceManager {
    private tracePath;
    constructor(config: PintaConfig);
    /** UserPromptSubmit 시 새 traceId 생성 및 저장 */
    newTrace(): string;
    /** 현재 traceId 반환. 없으면 새로 생성 */
    currentTrace(): string;
    private save;
}

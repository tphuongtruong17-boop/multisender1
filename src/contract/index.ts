import { Blockchain } from "@btc-vision/btc-runtime/runtime";
import { revertOnError } from "@btc-vision/btc-runtime/runtime/abort/abort";
import { MultiSender } from "../contracts/MultiSender";

Blockchain.contract = () => {
    return new MultiSender();
};

export * from "@btc-vision/btc-runtime/runtime/exports";

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
export function start(): void {}

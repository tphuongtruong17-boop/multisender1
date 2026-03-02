export { MultiSender } from "./contracts/MultiSender";

@global
var __deployFlag: i32 = 0;

export function start(): void {
  __deployFlag = 1;
}

export function onDeploy(): void {
  __deployFlag = 2;
}


export function assertTtrpgPlayerProtocolV1(input: {
  runtimeProtocol: number;
  minimumPlayerVersion: number;
  playerVersion: number;
}): void {
  if (
    !Number.isSafeInteger(input.playerVersion) ||
    input.playerVersion < 1 ||
    (input.runtimeProtocol !== 1 && input.runtimeProtocol !== 2) ||
    input.minimumPlayerVersion !== input.runtimeProtocol
  ) {
    throw new Error("跑团播放器协议声明无效");
  }
  if (input.playerVersion < input.minimumPlayerVersion) {
    throw new Error(`此跑团需要播放器协议 ${input.minimumPlayerVersion}`);
  }
}

import { encodeFunctionData, keccak256, parseUnits, toBytes, zeroAddress, type Address } from "viem";

export const ODDX_BETS_ARENA_ADDRESS = import.meta.env.VITE_ODDX_BETS_CONTRACT?.trim() ?? "";
export const X_LAYER_TESTNET_USDC = import.meta.env.VITE_XLAYER_TESTNET_USDC?.trim() ?? "";
export const X_LAYER_TESTNET_USDT = import.meta.env.VITE_XLAYER_TESTNET_USDT?.trim() ?? "";

export const oddXBetsArenaAbi = [
  {
    inputs: [
      { internalType: "address", name: "paymentToken", type: "address" },
      { internalType: "bytes32", name: "gameId", type: "bytes32" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "joinRound",
    outputs: [{ internalType: "uint256", name: "ticketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "paymentToken", type: "address" },
      { internalType: "bytes32", name: "marketId", type: "bytes32" },
      { internalType: "uint8", name: "outcomeId", type: "uint8" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "placePrediction",
    outputs: [{ internalType: "uint256", name: "ticketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "ticketId", type: "uint256" }],
    name: "cashOut",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const erc20Abi = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

type TokenSymbol = "OKB" | "USDC" | "USDT";

const tokenConfigs: Record<TokenSymbol, { address: Address | ""; decimals: number; native: boolean }> = {
  OKB: { address: zeroAddress, decimals: 18, native: true },
  USDC: { address: X_LAYER_TESTNET_USDC, decimals: 6, native: false },
  USDT: { address: X_LAYER_TESTNET_USDT, decimals: 6, native: false },
};

export function getTokenConfig(token: TokenSymbol) {
  return tokenConfigs[token];
}

export function requireArenaAddress(): Address {
  if (!ODDX_BETS_ARENA_ADDRESS) {
    throw new Error("Set VITE_ODDX_BETS_CONTRACT to your deployed oddX Bets contract address.");
  }

  return ODDX_BETS_ARENA_ADDRESS as Address;
}

export function requirePaymentTokenAddress(token: TokenSymbol): Address {
  const config = getTokenConfig(token);

  if (!config.native && !config.address) {
    throw new Error(`Set the X Layer testnet ${token} token address in VITE_XLAYER_TESTNET_${token}.`);
  }

  return config.address as Address;
}

export function scopeIdFromText(value: string) {
  return keccak256(toBytes(value));
}

export function parseStakeAmount(token: TokenSymbol, amount: string) {
  const config = getTokenConfig(token);
  return parseUnits(amount || "0", config.decimals);
}

export function buildApproveCall(token: TokenSymbol, spender: string, amount: string) {
  const config = getTokenConfig(token);
  if (config.native) return null;

  return {
    to: requirePaymentTokenAddress(token),
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender as Address, parseStakeAmount(token, amount)],
    }),
    value: "0x0" as `0x${string}`,
  };
}

export function buildJoinRoundCall(token: TokenSymbol, gameId: string, amount: string) {
  const config = getTokenConfig(token);
  const arenaAddress = requireArenaAddress();
  const rawAmount = parseStakeAmount(token, amount);

  return {
    to: arenaAddress,
    data: encodeFunctionData({
      abi: oddXBetsArenaAbi,
      functionName: "joinRound",
      args: [config.native ? zeroAddress : requirePaymentTokenAddress(token), scopeIdFromText(gameId), rawAmount],
    }),
    value: (config.native ? `0x${rawAmount.toString(16)}` : "0x0") as `0x${string}`,
  };
}

export function buildPlacePredictionCall(token: TokenSymbol, marketId: string, outcomeId: number, amount: string) {
  const config = getTokenConfig(token);
  const arenaAddress = requireArenaAddress();
  const rawAmount = parseStakeAmount(token, amount);

  return {
    to: arenaAddress,
    data: encodeFunctionData({
      abi: oddXBetsArenaAbi,
      functionName: "placePrediction",
      args: [config.native ? zeroAddress : requirePaymentTokenAddress(token), scopeIdFromText(marketId), outcomeId, rawAmount],
    }),
    value: (config.native ? `0x${rawAmount.toString(16)}` : "0x0") as `0x${string}`,
  };
}

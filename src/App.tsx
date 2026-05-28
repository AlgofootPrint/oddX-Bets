import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Coins,
  Flame,
  Gamepad2,
  Lock,
  Medal,
  Menu,
  Droplets,
  Play,
  ShieldCheck,
  Trophy,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import { ContainerScroll } from "./components/ui/container-scroll-animation";
import {
  ODDX_BETS_ARENA_ADDRESS,
  buildApproveCall,
  buildJoinRoundCall,
  buildPlacePredictionCall,
  getTokenConfig,
} from "./lib/oddxBetsArena";

const XLAYER_TESTNET = {
  chainId: "0x7A0",
  chainName: "X Layer testnet",
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    decimals: 18,
  },
  rpcUrls: ["https://testrpc.xlayer.tech/terigon"],
  blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer-test"],
};

const tokenOptions = ["OKB", "USDC", "USDT"] as const;
const KICKCRASH_BUILDER_EDGE_PERCENT = 7;
const PLAYABLE_GAME_IDS = ["kickcrash", "cupchase"] as const;
const KICKCRASH_KICKOFF_MS = 3289;
const KICKCRASH_IN_AIR_MIN_MS = 700;
const KICKCRASH_MAX_LIVE_MS = 60000;
const KICKCRASH_FALL_MS = 3307;
const CUPCHASE_RUNNING_MS = 10042;
const CUPCHASE_MIN_RUNNING_MS = 1200;
const ROUND_RESET_DELAY_MS: Record<"crashed" | "cashed", number> = {
  crashed: KICKCRASH_FALL_MS,
  cashed: 2200,
};
const MIN_LIVE_MS: Record<(typeof PLAYABLE_GAME_IDS)[number], number> = {
  kickcrash: KICKCRASH_IN_AIR_MIN_MS,
  cupchase: CUPCHASE_MIN_RUNNING_MS,
};
const MAX_LIVE_MS: Record<(typeof PLAYABLE_GAME_IDS)[number], number> = {
  kickcrash: KICKCRASH_MAX_LIVE_MS,
  cupchase: CUPCHASE_RUNNING_MS,
};

type Token = (typeof tokenOptions)[number];
type WalletSource = "OKX Wallet" | "EVM Wallet";
type RoundState = "waiting" | "kicking" | "live" | "crashed" | "cashed";
type AppTab = "home" | "games" | "predictions" | "my-predictions" | "profile";
type PredictionSelection = {
  market: string;
  option: string;
  odds: string;
  price: string;
  outcomeId: number;
};
type PlacedPrediction = PredictionSelection & {
  id: string;
  stake: string;
  token: Token;
  status: "Open" | "Pending";
  txHash: string;
};

type GameTicket = {
  id: string;
  gameId: string;
  gameName: string;
  stake: string;
  token: Token;
  joinTxHash: string;
};

type GameConfig = {
  id: string;
  name: string;
  kicker: string;
  status: string;
  accent: string;
  crashText: string;
  description: string;
  action: string;
  history: string[];
};

function isPlayableGame(gameId: string): gameId is (typeof PLAYABLE_GAME_IDS)[number] {
  return PLAYABLE_GAME_IDS.includes(gameId as (typeof PLAYABLE_GAME_IDS)[number]);
}

const games: GameConfig[] = [
  {
    id: "kickcrash",
    name: "KickCrash",
    kicker: "Flaming ball multiplier",
    status: "Playable demo",
    accent: "from-ember to-trophy",
    crashText: "Crashed!",
    description: "Stake before kickoff, watch the ball fly, and cash out before the multiplier collapses.",
    action: "Launch KickCrash",
    history: ["1.17x", "4.09x", "1.51x", "10.03x", "2.29x"],
  },
  {
    id: "cupchase",
    name: "Cup Chase",
    kicker: "Chase the trophy",
    status: "Playable demo",
    accent: "from-limeX to-trophy",
    crashText: "Trophy Escaped!",
    description: "A runner chases the World Cup while the multiplier rises. Cash out before the trophy gets away.",
    action: "Start Cup Chase",
    history: ["2.06x", "63.68x", "10.44x", "7.06x", "2.74x"],
  },
];

const markets = [
  {
    match: "Portugal vs France",
    time: "Final preview",
    pool: "842.40 OKB",
    volume: "$42.8K",
    closes: "Closes in 03:18:44",
    options: [
      { label: "Portugal", odds: "42%", price: "0.42" },
      { label: "Draw", odds: "19%", price: "0.19" },
      { label: "France", odds: "39%", price: "0.39" },
    ],
  },
  {
    match: "Brazil vs England",
    time: "Semi-final market",
    pool: "516.00 OKB",
    volume: "$28.1K",
    closes: "Closes in 1d 06h",
    options: [
      { label: "Brazil", odds: "48%", price: "0.48" },
      { label: "Draw", odds: "16%", price: "0.16" },
      { label: "England", odds: "36%", price: "0.36" },
    ],
  },
  {
    match: "Argentina vs Germany",
    time: "Classic rivalry",
    pool: "391.80 OKB",
    volume: "$19.6K",
    closes: "Closes in 2d 02h",
    options: [
      { label: "Argentina", odds: "44%", price: "0.44" },
      { label: "Draw", odds: "18%", price: "0.18" },
      { label: "Germany", odds: "38%", price: "0.38" },
    ],
  },
];

const shorten = (account: string) => `${account.slice(0, 6)}...${account.slice(-4)}`;

const PROFILE_STORAGE_KEY = "oddx-bets-profiles";
const BACKGROUND_SOUND_SRC = "/background%20sound.MP3";

function readProfiles(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function getProfileNameForWallet(wallet: string) {
  return readProfiles()[wallet.toLowerCase()] ?? "";
}

function saveProfileNameForWallet(wallet: string, username: string) {
  if (typeof window === "undefined") return;

  try {
    const profiles = readProfiles();
    profiles[wallet.toLowerCase()] = username;
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // Ignore storage failures in demo mode.
  }
}

function getOkxProvider() {
  return window.okxwallet;
}

function getFallbackProvider() {
  return window.ethereum;
}

function isXLayerTestnetChain(chainId: unknown) {
  return typeof chainId === "string" && chainId.toLowerCase() === XLAYER_TESTNET.chainId.toLowerCase();
}

type WalletTransaction = {
  from: string;
  to: string;
  data?: string;
  value?: string;
};

function formatWalletError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    if (isOkxNullWalletError(error)) {
      return "OKX Wallet could not submit the transaction. Reopen the wallet popup and try again.";
    }

    return error.message;
  }

  return fallback;
}

function isOkxNullWalletError(error: unknown) {
  return error instanceof Error && error.message.includes("Cannot read properties of null");
}

async function sendWalletTransaction(selectedProvider: Eip1193Provider, tx: WalletTransaction) {
  const result = await selectedProvider.request({
    method: "eth_sendTransaction",
    params: [tx],
  });

  if (typeof result === "string" && result.startsWith("0x")) {
    return result;
  }

  if (result === null) {
    return "";
  }

  throw new Error("Wallet submitted the request but did not return a transaction hash. Check OKX Wallet activity, then try again if no transaction appears.");
}

async function syncXLayerStatus(selectedProvider: Eip1193Provider) {
  const chainId = await selectedProvider.request({ method: "eth_chainId" });
  return isXLayerTestnetChain(chainId) ? "X Layer testnet connected" : "Switch to X Layer testnet";
}

function App() {
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const kickoffTimerRef = useRef<number | null>(null);
  const [account, setAccount] = useState("");
  const [walletSource, setWalletSource] = useState<WalletSource | "">("");
  const [username, setUsername] = useState("");
  const [profileWallet, setProfileWallet] = useState("");
  const [draftUsername, setDraftUsername] = useState("");
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [participationFeeTxHash, setParticipationFeeTxHash] = useState("");
  const [chainStatus, setChainStatus] = useState("Connect wallet");
  const [selectedToken, setSelectedToken] = useState<Token>("OKB");
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [placedPredictions, setPlacedPredictions] = useState<PlacedPrediction[]>([]);
  const [currentGameTicket, setCurrentGameTicket] = useState<GameTicket | null>(null);
  const [activeGame, setActiveGame] = useState(games[0]);
  const [roundState, setRoundState] = useState<RoundState>("waiting");
  const [multiplier, setMultiplier] = useState(1);
  const [betCountdown, setBetCountdown] = useState(5);
  const [stake, setStake] = useState("0.05");
  const [message, setMessage] = useState("Connect to X Layer to activate wallet-gated play.");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBackgroundMuted, setIsBackgroundMuted] = useState(false);
  const [mobileHeroScale, setMobileHeroScale] = useState(1.3);
  const [mobileHeroX, setMobileHeroX] = useState(2);
  const [mobileHeroY, setMobileHeroY] = useState(-40);
  const [mobileBallScale, setMobileBallScale] = useState(1.6);
  const [mobileBallX, setMobileBallX] = useState(56);
  const [mobileBallY, setMobileBallY] = useState(0);
  const ballScale = 1.5;
  const ballX = -96;
  const ballY = 0;
  const xLayerX = 0;
  const xLayerY = -20;

  const provider = useMemo(() => getOkxProvider() ?? getFallbackProvider(), []);

  const clearKickoffTimer = () => {
    if (kickoffTimerRef.current === null) return;
    window.clearTimeout(kickoffTimerRef.current);
    kickoffTimerRef.current = null;
  };

  useEffect(() => {
    const audio = new Audio(BACKGROUND_SOUND_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.495;
    backgroundAudioRef.current = audio;

    const removeUnlockListeners = () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };

    const playAudio = async () => {
      try {
        await audio.play();
        removeUnlockListeners();
      } catch {
        // Browsers generally require a user gesture before audible autoplay.
      }
    };

    const unlockAudio = () => {
      void playAudio();
    };

    void playAudio();
    window.addEventListener("click", unlockAudio);
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);

    return () => {
      removeUnlockListeners();
      audio.pause();
      backgroundAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.muted = isBackgroundMuted;
    }
  }, [isBackgroundMuted]);

  useEffect(() => clearKickoffTimer, []);

  useEffect(() => {
    if (!provider?.on) return;

    const handleAccounts = (accounts: unknown) => {
      if (Array.isArray(accounts) && typeof accounts[0] === "string") {
        setAccount(accounts[0]);
      } else {
        setAccount("");
        setWalletSource("");
      }
    };

    const handleChain = () => {
      setChainStatus("Network changed. Switch to X Layer testnet if prompted.");
    };

    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
    };
  }, [provider]);

  useEffect(() => {
    if (!isPlayableGame(activeGame.id) || roundState !== "waiting") return;

    setBetCountdown(5);
    const countdownTimer = window.setInterval(() => {
      setBetCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(countdownTimer);
          startRound(activeGame);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(countdownTimer);
  }, [activeGame, roundState]);

  useEffect(() => {
    if (!isPlayableGame(activeGame.id) || roundState !== "live") return;

    let liveMultiplier = 1;
    const liveStartedAt = window.performance.now();
    const isCupChase = activeGame.id === "cupchase";
    const minimumLiveMs = MIN_LIVE_MS[activeGame.id];
    const roll = Math.random();
    const crashAt =
      isCupChase
        ? roll < 0.01
          ? 1.2 + Math.random() * 1
          : roll < 0.18
            ? 2.5 + Math.random() * 1.8
            : roll < 0.45
              ? 4.3 + Math.random() * 3.7
              : roll < 0.72
                ? 8 + Math.random() * 4
                : roll < 0.9
                  ? 12 + Math.random() * 4
                  : 16 + Math.random() * 4
        : roll < 0.01
          ? 1.3 + Math.random() * 1.1
          : roll < 0.18
            ? 2.8 + Math.random() * 1.7
            : roll < 0.42
              ? 4.5 + Math.random() * 3.5
              : roll < 0.68
                ? 8 + Math.random() * 4
                : roll < 0.88
                  ? 12 + Math.random() * 4
                  : 16 + Math.random() * 4;

    const timer = window.setInterval(() => {
      const edgeDrag = isCupChase ? 1 - KICKCRASH_BUILDER_EDGE_PERCENT / 100 : 1 - KICKCRASH_BUILDER_EDGE_PERCENT / 140;
      const step = isCupChase
        ? (0.035 + Math.random() * 0.075) * (1 + liveMultiplier * 0.07)
        : (0.035 + Math.random() * 0.075) * (1 + liveMultiplier * 0.08);
      liveMultiplier = Number((liveMultiplier + step * edgeDrag).toFixed(2));
      setMultiplier(liveMultiplier);

      if (liveMultiplier >= crashAt && window.performance.now() - liveStartedAt >= minimumLiveMs) {
        window.clearInterval(timer);
        setRoundState("crashed");
        setMultiplier(Number(crashAt.toFixed(2)));
        setMessage(`${activeGame.crashText} Round stopped at ${crashAt.toFixed(2)}x.`);
      }
    }, 150);

    return () => window.clearInterval(timer);
  }, [activeGame.crashText, activeGame.id, roundState]);

  useEffect(() => {
    if (!isPlayableGame(activeGame.id) || roundState !== "live") return;

    const liveGuardTimer = window.setTimeout(() => {
      setRoundState("crashed");
      setMessage(`${activeGame.name} round forced closed.`);
    }, MAX_LIVE_MS[activeGame.id]);

    return () => window.clearTimeout(liveGuardTimer);
  }, [activeGame.id, activeGame.name, roundState]);

  useEffect(() => {
    if (!isPlayableGame(activeGame.id) || !["crashed", "cashed"].includes(roundState)) return;

    const resetTimer = window.setTimeout(() => {
      setRoundState("waiting");
      setMultiplier(1);
      setBetCountdown(5);
      setCurrentGameTicket(null);
      setMessage(`${activeGame.name} ready for the next round.`);
    }, ROUND_RESET_DELAY_MS[roundState as "crashed" | "cashed"]);

    return () => window.clearTimeout(resetTimer);
  }, [activeGame.id, activeGame.name, roundState]);

  async function connectWallet() {
    const okx = getOkxProvider();
    const evm = getFallbackProvider();
    const selectedProvider = okx ?? evm;

    if (!selectedProvider) {
      setMessage("No injected EVM wallet found. Install OKX Wallet or open this page in a Web3 browser.");
      return;
    }

    try {
      const accounts = (await selectedProvider.request({ method: "eth_requestAccounts" })) as string[];
      const nextAccount = accounts[0];
      setAccount(nextAccount);
      setWalletSource(okx ? "OKX Wallet" : "EVM Wallet");
      setChainStatus(await syncXLayerStatus(selectedProvider));
      const savedUsername = getProfileNameForWallet(nextAccount);
      if (savedUsername) {
        setUsername(savedUsername);
        setProfileWallet(nextAccount);
      } else {
        setUsername("");
        setProfileWallet("");
        setDraftUsername("");
        setIsUsernameModalOpen(true);
      }
      setMessage("Wallet connected. Games and prediction markets are ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet connection was rejected.");
    }
  }

  function disconnectWallet() {
    setAccount("");
    setWalletSource("");
    setUsername("");
    setProfileWallet("");
    setChainStatus("Connect wallet");
    setMessage("Wallet disconnected.");
  }

  function requireWallet(action: string) {
    if (account) return true;

    setChainStatus("Connect OKX Wallet");
    setMessage(`Connect OKX Wallet to ${action}.`);
    void connectWallet();
    return false;
  }

  async function beginRound(game: GameConfig) {
    if (!requireWallet("join this round")) return;
    if (roundState !== "waiting") {
      setMessage("Wait for the next betting window before joining another round.");
      return;
    }

    try {
      const joinTxHash = await sendArenaParticipation({
        kind: "game",
        scope: game.id,
        label: game.name,
        token: selectedToken,
        amount: stake,
      });
      setCurrentGameTicket({
        id: `${game.id}-${Date.now()}`,
        gameId: game.id,
        gameName: game.name,
        stake,
        token: selectedToken,
        joinTxHash: joinTxHash ?? "",
      });
      startRound(game);
    } catch {
      // message already handled in sendArenaParticipation
    }
  }

  async function sendArenaParticipation({
    kind,
    scope,
    label,
    token,
    amount,
    outcomeId = 0,
  }: {
    kind: "game" | "prediction";
    scope: string;
    label: string;
    token: Token;
    amount: string;
    outcomeId?: number;
  }) {
    const selectedProvider = provider;
    if (!selectedProvider || !account) {
      throw new Error("Connect your wallet before joining a game or placing a prediction.");
    }

    if (!ODDX_BETS_ARENA_ADDRESS) {
      throw new Error("Set VITE_ODDX_BETS_CONTRACT to the deployed oddX Bets contract address.");
    }

    const tokenConfig = getTokenConfig(token);

    try {
      if (!tokenConfig.native) {
        const approveCall = buildApproveCall(token, ODDX_BETS_ARENA_ADDRESS, amount);
        if (!approveCall) {
          throw new Error(`Token approval is unavailable for ${token}.`);
        }

        setMessage(`Approving ${token} for ${kind === "game" ? "join round" : "prediction"}...`);
        await sendWalletTransaction(selectedProvider, {
          from: account,
          to: approveCall.to,
          data: approveCall.data,
          value: approveCall.value,
        });
      }

      const call = kind === "game"
        ? buildJoinRoundCall(token, scope, amount)
        : buildPlacePredictionCall(token, scope, outcomeId, amount);

      setMessage(`Submitting ${kind === "game" ? "join round" : "prediction"} on oddX Bets...`);
      const txHash = await sendWalletTransaction(selectedProvider, {
        from: account,
        to: call.to,
        data: call.data,
        value: call.value,
      });

      setParticipationFeeTxHash(txHash);
      setMessage(txHash ? `${label} confirmed on-chain.` : `${label} submitted. OKX Wallet did not return a transaction hash, so this ticket is marked pending.`);
      return txHash;
    } catch (error) {
      if (isOkxNullWalletError(error)) {
        setParticipationFeeTxHash("");
        setMessage(`${label} submitted. OKX Wallet did not return a transaction hash, so this ticket is marked pending.`);
        return "";
      }

      setMessage(formatWalletError(error, "Participation transaction was rejected."));
      throw error;
    }
  }

  async function ensureXLayer(selectedProvider = provider) {
    if (!selectedProvider) return;

    try {
      const chainId = await selectedProvider.request({ method: "eth_chainId" });
      if (isXLayerTestnetChain(chainId)) {
        setChainStatus("X Layer testnet connected");
        return;
      }

      await selectedProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: XLAYER_TESTNET.chainId }],
      });
      setChainStatus("X Layer testnet connected");
    } catch {
      try {
        await selectedProvider.request({
          method: "wallet_addEthereumChain",
          params: [XLAYER_TESTNET],
        });
        setChainStatus("X Layer testnet added");
      } catch {
        setChainStatus("Switch to X Layer testnet");
      }
    }
  }

  function startRound(game: GameConfig) {
    clearKickoffTimer();
    setActiveGame(game);
    setMultiplier(1);
    if (game.id === "kickcrash") {
      setRoundState("kicking");
      setBetCountdown(0);
      setMessage("KickCrash kickoff. Ball is launching.");
      kickoffTimerRef.current = window.setTimeout(() => {
        kickoffTimerRef.current = null;
        setRoundState("live");
        setMessage("KickCrash live. Cash out before the ball crashes.");
      }, KICKCRASH_KICKOFF_MS + 150);
      return;
    }

    if (game.id === "cupchase") {
      setRoundState("live");
      setBetCountdown(0);
      setMessage("Cup Chase live. Cash out before the trophy escapes.");
      return;
    }

    setRoundState("live");
    setMessage(`${game.name} live. Cash out before the crash.`);
  }

  function completeKickCrashKickoff() {
    if (activeGame.id !== "kickcrash" || roundState !== "kicking") return;
    clearKickoffTimer();
    setRoundState("live");
    setMessage("KickCrash live. Cash out before the ball crashes.");
  }

  function completeCrashAnimation() {
    if (!isPlayableGame(activeGame.id) || roundState !== "crashed") return;
    setRoundState("waiting");
    setMultiplier(1);
    setBetCountdown(5);
    setCurrentGameTicket(null);
    setMessage(`${activeGame.name} ready for the next round.`);
  }

  async function cashOut() {
    if (!requireWallet("cash out")) return;

    if (roundState !== "live") return;
    const payout = (Number(stake || 0) * multiplier).toFixed(3);
    let claimProof = "";
    if (provider) {
      try {
        claimProof = (await provider.request({
          method: "personal_sign",
          params: [
            `oddX Bets cashout claim | game=${activeGame.name} | stake=${stake} ${selectedToken} | multiplier=${multiplier.toFixed(2)}x | payout=${payout} ${selectedToken}`,
            account,
          ],
        })) as string;
      } catch {
        claimProof = "";
      }
    }

    setRoundState("cashed");
    setMessage(
      `Cashed out at ${multiplier.toFixed(2)}x for ${stake} ${selectedToken}. Payout ${payout} ${selectedToken}${claimProof ? " | claim proof recorded." : "."}`,
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      {activeTab === "home" ? (
        <Hero
          account={account}
          walletSource={walletSource}
          chainStatus={chainStatus}
          message={message}
          isMobileMenuOpen={isMobileMenuOpen}
          mobileHeroScale={mobileHeroScale}
          mobileHeroX={mobileHeroX}
          mobileHeroY={mobileHeroY}
          setMobileHeroScale={setMobileHeroScale}
          setMobileHeroX={setMobileHeroX}
          setMobileHeroY={setMobileHeroY}
          mobileBallScale={mobileBallScale}
          mobileBallX={mobileBallX}
          mobileBallY={mobileBallY}
          setMobileBallScale={setMobileBallScale}
          setMobileBallX={setMobileBallX}
          setMobileBallY={setMobileBallY}
          onConnect={connectWallet}
          onDisconnect={disconnectWallet}
          onSwitch={() => ensureXLayer()}
          onToggleMobileMenu={() => setIsMobileMenuOpen((current) => !current)}
          isBackgroundMuted={isBackgroundMuted}
          onToggleBackgroundAudio={() => setIsBackgroundMuted((current) => !current)}
          ballScale={ballScale}
          ballX={ballX}
          ballY={ballY}
          xLayerX={xLayerX}
          xLayerY={xLayerY}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      ) : (
        <AppNavbar
          account={account}
          walletSource={walletSource}
          chainStatus={chainStatus}
          isMobileMenuOpen={isMobileMenuOpen}
          onConnect={connectWallet}
          onDisconnect={disconnectWallet}
          onSwitch={() => ensureXLayer()}
          onToggleMobileMenu={() => setIsMobileMenuOpen((current) => !current)}
          isBackgroundMuted={isBackgroundMuted}
          onToggleBackgroundAudio={() => setIsBackgroundMuted((current) => !current)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}

      {(activeTab === "home" || activeTab === "games") && (
        <>
          <section className="border-y border-white/10 bg-[#07100c] px-4 py-5">
            <div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible md:pb-0">
              {[
                ["Native chain", "X Layer testnet"],
                ["Primary coin", "OKB"],
                ["Fallback tokens", "USDC + USDT"],
                ["Game model", "Crash + predictions"],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-[11rem] shrink-0 items-center justify-between rounded border border-white/10 bg-white/[0.03] px-3 py-2.5 md:min-w-0 md:px-4 md:py-3">
                  <span className="text-[11px] text-white/55 md:text-sm">{label}</span>
                  <strong className="whitespace-nowrap text-[11px] text-white md:text-sm">{value}</strong>
                </div>
              ))}
            </div>
          </section>

          <GamesSection
            account={account}
            activeGame={activeGame}
            multiplier={multiplier}
            roundState={roundState}
            betCountdown={betCountdown}
            currentGameTicket={currentGameTicket}
            stake={stake}
            selectedToken={selectedToken}
            onStakeChange={setStake}
            onTokenChange={setSelectedToken}
            onStart={beginRound}
            onSelectGame={(game) => {
              clearKickoffTimer();
              setActiveGame(game);
              setRoundState("waiting");
              setMultiplier(1);
              setBetCountdown(5);
              setCurrentGameTicket(null);
              setMessage(game.id === "kickcrash" ? "KickCrash selected. Wait for the next betting window." : "Cup Chase selected. Wait for the next betting window.");
            }}
            onCashOut={cashOut}
            onKickoffComplete={completeKickCrashKickoff}
            onCrashComplete={completeCrashAnimation}
          />

          <LiveWinsTicker variant="section" />
        </>
      )}

      {(activeTab === "home" || activeTab === "predictions") && (
        <MarketsSection
          selectedToken={selectedToken}
          onTokenChange={setSelectedToken}
          account={account}
          placedPredictions={placedPredictions}
          onPlacedPrediction={setPlacedPredictions}
          onSubmitParticipation={sendArenaParticipation}
          onConnectWallet={connectWallet}
        />
      )}

      {activeTab === "my-predictions" && (
        <MyPredictionsSection placedPredictions={placedPredictions} account={account} />
      )}

      {activeTab === "profile" && (
        <ProfileSection
          account={account}
          walletSource={walletSource}
          username={username}
          profileWallet={profileWallet}
          placedPredictions={placedPredictions}
          participationFeeTxHash={participationFeeTxHash}
        />
      )}

      <Footer />

      {isUsernameModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded border border-white/10 bg-[#080d09] p-5 text-white shadow-2xl">
            <p className="text-sm font-bold uppercase text-limeX">Create profile</p>
            <h3 className="mt-1 text-2xl font-black">Choose a username</h3>
            <p className="mt-2 text-sm leading-6 text-white/55">
              This name will appear on your oddX Bets profile and prediction tickets.
            </p>
            <input
              value={draftUsername}
              onChange={(event) => setDraftUsername(event.target.value)}
              placeholder="e.g. MatchdayKing"
              className="mt-5 h-12 w-full rounded border border-white/10 bg-white/[0.05] px-3 text-white outline-none focus:border-limeX"
            />
            <button
              disabled={!draftUsername.trim()}
              onClick={() => {
                const nextUsername = draftUsername.trim();
                if (!account || !nextUsername) return;

                saveProfileNameForWallet(account, nextUsername);
                setUsername(nextUsername);
                setProfileWallet(account);
                setIsUsernameModalOpen(false);
              }}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded bg-limeX px-4 text-sm font-black text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35"
            >
              Save Profile
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Hero({
  account,
  walletSource,
  chainStatus,
  message,
  isMobileMenuOpen,
  mobileHeroScale,
  mobileHeroX,
  mobileHeroY,
  setMobileHeroScale,
  setMobileHeroX,
  setMobileHeroY,
  mobileBallScale,
  mobileBallX,
  mobileBallY,
  setMobileBallScale,
  setMobileBallX,
  setMobileBallY,
  onConnect,
  onDisconnect,
  onSwitch,
  onToggleMobileMenu,
  isBackgroundMuted,
  onToggleBackgroundAudio,
  ballScale,
  ballX,
  ballY,
  xLayerX,
  xLayerY,
  activeTab,
  onTabChange,
}: {
  account: string;
  walletSource: WalletSource | "";
  chainStatus: string;
  message: string;
  isMobileMenuOpen: boolean;
  mobileHeroScale: number;
  mobileHeroX: number;
  mobileHeroY: number;
  setMobileHeroScale: (value: number) => void;
  setMobileHeroX: (value: number) => void;
  setMobileHeroY: (value: number) => void;
  mobileBallScale: number;
  mobileBallX: number;
  mobileBallY: number;
  setMobileBallScale: (value: number) => void;
  setMobileBallX: (value: number) => void;
  setMobileBallY: (value: number) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitch: () => void;
  onToggleMobileMenu: () => void;
  isBackgroundMuted: boolean;
  onToggleBackgroundAudio: () => void;
  ballScale: number;
  ballX: number;
  ballY: number;
  xLayerX: number;
  xLayerY: number;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  return (
    <section id="home" className="relative overflow-hidden bg-white px-4 pb-12 pt-0 text-black md:pt-0">
      <img
        src="/hero2.png"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-100 md:inset-x-0 md:bottom-0 md:h-[34rem]"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-white/20 md:inset-x-0 md:bottom-0 md:h-[34rem]" />
      <AppNavbar
        account={account}
        walletSource={walletSource}
        chainStatus={chainStatus}
        isMobileMenuOpen={isMobileMenuOpen}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onSwitch={onSwitch}
        onToggleMobileMenu={onToggleMobileMenu}
        isBackgroundMuted={isBackgroundMuted}
        onToggleBackgroundAudio={onToggleBackgroundAudio}
        activeTab={activeTab}
        onTabChange={onTabChange}
        flush
      />

      <ContainerScroll
        mobileTransformScale={mobileHeroScale}
        mobileTransformX={mobileHeroX}
        mobileTransformY={mobileHeroY}
        titleComponent={
          <div className="relative mx-auto hidden min-h-[16rem] max-w-6xl text-center sm:block sm:min-h-[20rem] md:min-h-[24rem]">
            <img
              src="/ball.png"
              alt=""
              className="pointer-events-none absolute left-4 top-1/2 z-20 hidden h-28 w-28 -translate-y-1/2 object-contain md:left-10 md:h-40 md:w-40 lg:left-16 lg:h-52 lg:w-52"
              style={{ transform: `translate(${ballX}px, calc(-50% + ${ballY}px)) scale(${ballScale})` }}
              draggable={false}
            />
            <img
              src="/ball.png"
              alt=""
              className="pointer-events-none absolute right-4 top-1/2 z-20 hidden h-28 w-28 -translate-y-1/2 object-contain md:right-10 md:h-40 md:w-40 lg:right-16 lg:h-52 lg:w-52"
              style={{ transform: `translate(${-ballX}px, calc(-50% + ${ballY}px)) scale(${ballScale})` }}
              draggable={false}
            />
            <div className="relative z-30" style={{ transform: `translate(${xLayerX}px, ${xLayerY}px)` }}>
              <div className="mb-3 mt-8 inline-flex items-center gap-2 rounded border border-black/10 bg-white px-2.5 py-1.5 text-[10px] font-bold text-black shadow-sm sm:mb-5 sm:mt-12 sm:px-4 sm:py-2 sm:text-sm md:mt-16">
                <Activity size={13} className="text-black sm:size-[17px]" />
                Wallet-connected World Cup arena
              </div>
              <p className="mb-1 text-[11px] font-bold text-black/50 sm:mb-2 sm:text-base md:text-xl">Powered by</p>
              <h2
                className="text-[2.15rem] font-extrabold leading-[0.95] tracking-[-0.03em] text-black sm:text-6xl md:text-8xl lg:text-[8.5rem]"
                style={{ fontFamily: 'Inter, "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif' }}
              >
                X Layer
              </h2>
              <p className="mt-3 text-sm font-black text-black sm:mt-5 sm:text-xl md:text-3xl">Built for matchday Wins</p>
            </div>
          </div>
        }
      >
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black text-white">
          <img
            src="/hero.png"
            alt="oddX Bets World Cup hero"
            className="absolute inset-0 h-full w-full object-cover object-[center_24%]"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/84 via-black/28 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="relative z-10 flex h-full items-center px-5 pb-8 md:px-10">
            <div className="w-full">
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded border border-white/12 bg-black/50 px-2.5 py-1.5 text-[10px] text-white/78 sm:mb-5 sm:px-3 sm:py-2 sm:text-sm">
                <Trophy size={13} className="text-trophy sm:size-4" />
                World Cup GameFi betting on X Layer
              </div>

              <h1 className="max-w-4xl text-[2.4rem] font-black leading-[0.94] tracking-normal sm:text-7xl lg:text-8xl">
                MatchBets
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold text-white sm:mt-5 sm:text-2xl">
                Predict the match. Play the game. Win on X Layer.
              </p>
              <p className="mt-3 max-w-2xl text-[11px] leading-5 text-white sm:mt-5 sm:text-base sm:leading-7 sm:text-white/70">
                A wallet-connected World Cup arena with crash games, OKB-first staking, USDC and USDT fallbacks, and prediction markets built for on-chain settlement.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-7 sm:flex sm:flex-row sm:flex-wrap sm:gap-3">
                <button
                  onClick={onConnect}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded bg-white px-4 py-2.5 text-xs font-black text-black transition hover:bg-limeX sm:min-h-11 sm:w-auto sm:px-5 sm:py-3 sm:text-sm"
                >
                  <Wallet size={16} className="sm:size-[18px]" />
                  {account ? "Wallet Connected" : "Connect OKX Wallet"}
                </button>
                {account && (
                  <button
                    onClick={onDisconnect}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded border border-white/15 bg-black/25 px-4 py-2.5 text-xs font-bold text-white transition hover:border-white/30 sm:min-h-11 sm:w-auto sm:px-5 sm:py-3 sm:text-sm"
                  >
                    Disconnect Wallet
                  </button>
                )}
                <a
                  href="#games"
                  className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded border border-white/18 bg-black/35 px-4 py-2.5 text-xs font-bold text-white transition hover:border-limeX/70 sm:min-h-11 sm:w-auto sm:px-5 sm:py-3 sm:text-sm ${account ? "col-span-2" : ""}`}
                >
                  <Play size={16} className="sm:size-[18px]" />
                  Enter Games
                </a>
              </div>

              <div className="mt-4 max-w-xl rounded border border-white/10 bg-black/45 px-3 py-2 text-[11px] leading-5 text-white/72 sm:mt-6 sm:px-4 sm:py-3 sm:text-sm sm:leading-6">
                {message}
              </div>
            </div>
          </div>
          <LiveWinsTicker />
        </div>
      </ContainerScroll>
      <img
        src="/ball.png"
        alt=""
        className="pointer-events-none absolute bottom-8 left-3 z-20 h-20 w-20 object-contain sm:bottom-10 sm:left-4 sm:h-24 sm:w-24 md:hidden"
        style={{ transform: `translate(${mobileBallX}px, ${mobileBallY}px) scale(${mobileBallScale})` }}
        draggable={false}
      />
      <img
        src="/ball.png"
        alt=""
        className="pointer-events-none absolute bottom-8 right-3 z-20 h-20 w-20 object-contain sm:bottom-10 sm:right-4 sm:h-24 sm:w-24 md:hidden"
        style={{ transform: `translate(${-mobileBallX}px, ${mobileBallY}px) scale(${mobileBallScale})` }}
        draggable={false}
      />
    </section>
  );
}

function AppNavbar({
  account,
  walletSource,
  chainStatus,
  isMobileMenuOpen,
  onConnect,
  onDisconnect,
  onSwitch,
  onToggleMobileMenu,
  isBackgroundMuted,
  onToggleBackgroundAudio,
  activeTab,
  onTabChange,
  flush = false,
}: {
  account: string;
  walletSource: WalletSource | "";
  chainStatus: string;
  isMobileMenuOpen: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitch: () => void;
  onToggleMobileMenu: () => void;
  isBackgroundMuted: boolean;
  onToggleBackgroundAudio: () => void;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  flush?: boolean;
}) {
  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 border-y border-white/10 bg-black py-2 shadow-xl">
        <div className="px-3 md:px-4">
          <div className="relative flex items-center justify-between gap-3 md:hidden">
            <div className="flex items-center gap-2 pr-1">
              <img src="/newlogo.png" alt="oddX Bets" className="h-10 w-auto object-contain" draggable={false} />
              <p className="text-base font-black tracking-tight text-white">oddX Bets</p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={onToggleBackgroundAudio}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-white/15 bg-white/[0.04] px-2 py-2 text-white"
                aria-label={isBackgroundMuted ? "Unmute background sound" : "Mute background sound"}
                title={isBackgroundMuted ? "Unmute" : "Mute"}
              >
                {isBackgroundMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button
                onClick={account ? onSwitch : onConnect}
                className="inline-flex min-h-9 items-center gap-2 rounded border border-limeX/60 bg-limeX px-2.5 py-2 text-xs font-bold text-black"
              >
                <Wallet size={15} />
                {account ? "Use X Layer" : "Connect"}
              </button>
              <a
                href="https://web3.okx.com/xlayer/faucet?utm_source=chatgpt.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center justify-center rounded border border-white/15 bg-white/[0.04] px-3 py-2 text-white"
                aria-label="Open faucet"
              >
                <Droplets size={16} />
              </a>
              <button
                onClick={onToggleMobileMenu}
                className="inline-flex min-h-9 items-center justify-center rounded border border-limeX/60 bg-limeX px-3 py-2 text-white"
                aria-label="Open navigation menu"
              >
                <Menu size={18} className="text-white" />
              </button>
            </div>

            {isMobileMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded border border-white/10 bg-black p-2 shadow-2xl">
                <div className="grid gap-1">
                  {[
                    ["Home", "home"],
                    ["Games", "games"],
                    ["Predictions", "predictions"],
                    ["My Predictions", "my-predictions"],
                    ["Profile", "profile"],
                  ].map(([label, tab]) => (
                    <button
                      key={label}
                      onClick={() => {
                        onTabChange(tab as AppTab);
                        onToggleMobileMenu();
                      }}
                      className={`rounded px-3 py-2 text-left text-sm font-bold transition ${
                        activeTab === tab ? "bg-white/10 text-limeX" : "text-white/70 hover:bg-white/10 hover:text-limeX"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {account && (
                    <button
                      onClick={() => {
                        onDisconnect();
                        onToggleMobileMenu();
                      }}
                      className="rounded px-3 py-2 text-left text-sm font-bold text-white/70 hover:bg-white/10 hover:text-limeX"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="hidden items-center justify-between gap-3 md:flex">
            <div className="flex items-center gap-2 pr-1">
              <img src="/newlogo.png" alt="oddX Bets" className="h-10 w-auto object-contain md:h-11" draggable={false} />
              <p className="text-base font-black tracking-tight text-white md:text-lg">oddX Bets</p>
              <p className="hidden text-[11px] font-semibold text-white/55 xl:block">OKX Wallet-first World Cup arena</p>
            </div>

            <div className="flex items-center justify-center gap-0.5">
              {[
                ["Home", "home"],
                ["Games", "games"],
                ["Predictions", "predictions"],
                ["My Predictions", "my-predictions"],
                ["Profile", "profile"],
              ].map(([label, tab]) => (
                <button
                  key={label}
                  onClick={() => onTabChange(tab as AppTab)}
                  className={`rounded px-2.5 py-1.5 text-sm font-bold transition ${
                    activeTab === tab ? "bg-white/10 text-limeX" : "text-white/65 hover:bg-white/10 hover:text-limeX"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="hidden items-center gap-1.5 xl:flex">
              <div className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white/65">
                <ShieldCheck size={14} />
                {chainStatus}
              </div>
              {account && (
                <div className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white/65">
                  <Wallet size={14} />
                  {walletSource} {shorten(account)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onToggleBackgroundAudio}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-white/15 bg-white/[0.04] px-2.5 py-2 text-white transition hover:bg-white/[0.1]"
                aria-label={isBackgroundMuted ? "Unmute background sound" : "Mute background sound"}
                title={isBackgroundMuted ? "Unmute" : "Mute"}
              >
                {isBackgroundMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button
                onClick={account ? onSwitch : onConnect}
                className="inline-flex min-h-9 items-center gap-2 rounded border border-limeX/60 bg-limeX px-2.5 py-2 text-sm font-bold text-black transition hover:bg-white md:px-3"
              >
                <Wallet size={16} />
                {account ? "Use X Layer" : "Connect OKX Wallet"}
              </button>
              <a
                href="https://web3.okx.com/xlayer/faucet?utm_source=chatgpt.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-8 items-center gap-1.5 rounded border border-white/15 bg-white/[0.04] px-2 py-1.5 text-xs font-bold text-white transition hover:bg-white/[0.1]"
              >
                <Droplets size={14} />
                Faucet
              </a>
              {account && (
                <button
                  onClick={onDisconnect}
                  className="inline-flex min-h-9 items-center gap-2 rounded border border-white/15 bg-white/[0.04] px-2.5 py-2 text-sm font-bold text-white transition hover:bg-white/[0.1] md:px-3"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
      <div className="h-[108px] md:h-[68px]" aria-hidden="true" />
    </>
  );
}

function LiveWinsTicker({ variant = "hero" }: { variant?: "hero" | "section" }) {
  const wins = [
    "0x7A...19F2 cashed out KickCrash at 2.41x",
    "0xB3...8C44 won 18.6 OKB on Portugal",
    "0x42...A91E hit Cup Chase at 3.08x",
    "0x91...F06D claimed 420 USDT pool share",
    "0xD8...2B10 cashed out at 1.92x",
    "0x5C...77AF won 96 USDC on France",
    "0xE1...3D29 climbed to Matchday Rank #12",
    "0x66...9AA0 locked 0.25 OKB on Brazil",
  ];

  return (
    <div
      className={
        variant === "hero"
          ? "absolute inset-x-0 bottom-0 z-40 overflow-hidden border-t border-white/10 bg-black/88 py-3 text-white backdrop-blur-sm"
          : "relative overflow-hidden border-y border-white/10 bg-black py-3 text-white md:py-4"
      }
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-black to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-black to-transparent" />
      <div className="live-wins-track flex w-max gap-3">
        {[...wins, ...wins].map((win, index) => (
          <div
            key={`${win}-${index}`}
            className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white/80"
          >
            <span className="h-2 w-2 rounded-full bg-limeX shadow-glow" />
            {win}
          </div>
        ))}
      </div>
    </div>
  );
}

function KickCrashMedia({
  roundState,
  onKickoffComplete,
  onCrashComplete,
}: {
  roundState: RoundState;
  onKickoffComplete: () => void;
  onCrashComplete: () => void;
}) {
  const kickoffVideoRef = useRef<HTMLVideoElement>(null);
  const inAirVideoRef = useRef<HTMLVideoElement>(null);
  const fallVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videos = [kickoffVideoRef.current, inAirVideoRef.current, fallVideoRef.current];
    const activeVideo =
      roundState === "kicking"
        ? kickoffVideoRef.current
        : roundState === "live" || roundState === "cashed"
          ? inAirVideoRef.current
          : roundState === "crashed"
            ? fallVideoRef.current
            : null;

    videos.forEach((video) => {
      if (video && video !== activeVideo) {
        video.pause();
      }
    });

    if (!activeVideo) return;

    activeVideo.currentTime = 0;
    void activeVideo.play().catch(() => {
      // Browsers can still reject autoplay; muted + playsInline handles most cases.
    });
  }, [roundState]);

  return (
    <>
      <img
        src="/kick/restingstatekick.png"
        alt="KickCrash resting state"
        className={`absolute inset-0 z-0 h-full w-full object-cover object-center ${roundState === "waiting" ? "opacity-100" : "opacity-0"}`}
        draggable={false}
      />
      <video
        ref={kickoffVideoRef}
        className={`absolute inset-0 z-0 h-full w-full object-cover object-center ${roundState === "kicking" ? "opacity-100" : "opacity-0"}`}
        preload="auto"
        muted
        playsInline
        controls={false}
        onEnded={onKickoffComplete}
      >
        <source src="/kick/kickanimation2.mp4" type="video/mp4" />
      </video>
      <video
        ref={inAirVideoRef}
        className={`absolute inset-0 z-0 h-full w-full object-cover object-center ${roundState === "live" || roundState === "cashed" ? "opacity-100" : "opacity-0"}`}
        loop
        preload="auto"
        muted
        playsInline
        controls={false}
      >
        <source src="/kick/inair.mp4" type="video/mp4" />
      </video>
      <video
        ref={fallVideoRef}
        className={`absolute inset-0 z-0 h-full w-full object-cover object-center ${roundState === "crashed" ? "opacity-100" : "opacity-0"}`}
        preload="auto"
        muted
        playsInline
        controls={false}
        onEnded={onCrashComplete}
      >
        <source src="/kick/fallball.mp4" type="video/mp4" />
      </video>
    </>
  );
}

function CupChaseMedia({ roundState }: { roundState: RoundState }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (roundState !== "live") {
      video.pause();
      return;
    }

    video.currentTime = 0;
    void video.play().catch(() => {
      // Keep the component visible even if the browser blocks autoplay.
    });
  }, [roundState]);

  return (
    <>
      <img
        src="/run/race1.png"
        alt="Cup Chase ready state"
        className={`absolute inset-0 z-0 h-full w-full object-cover object-center ${roundState === "waiting" || roundState === "cashed" ? "opacity-100" : "opacity-0"}`}
        draggable={false}
      />
      <video
        ref={videoRef}
        className={`absolute inset-0 z-0 h-full w-full object-cover object-center ${roundState === "live" ? "opacity-100" : "opacity-0"}`}
        loop
        preload="auto"
        muted
        playsInline
        controls={false}
      >
        <source src="/run/running.mp4" type="video/mp4" />
      </video>
      <img
        src="/run/ranway.png"
        alt="Cup Chase trophy escaped"
        className={`absolute inset-0 z-0 h-full w-full object-cover object-center ${roundState === "crashed" ? "opacity-100" : "opacity-0"}`}
        draggable={false}
      />
    </>
  );
}

function GamesSection({
  account,
  activeGame,
  multiplier,
  roundState,
  betCountdown,
  currentGameTicket,
  stake,
  selectedToken,
  onStakeChange,
  onTokenChange,
  onStart,
  onSelectGame,
  onCashOut,
  onKickoffComplete,
  onCrashComplete,
}: {
  account: string;
  activeGame: GameConfig;
  multiplier: number;
  roundState: RoundState;
  betCountdown: number;
  currentGameTicket: GameTicket | null;
  stake: string;
  selectedToken: Token;
  onStakeChange: (value: string) => void;
  onTokenChange: (value: Token) => void;
  onStart: (game: GameConfig) => void;
  onSelectGame: (game: GameConfig) => void;
  onCashOut: () => void;
  onKickoffComplete: () => void;
  onCrashComplete: () => void;
}) {
  const stakeAmount = Number(stake || 0);
  const potentialWin = useMemo(() => `${(stakeAmount * multiplier).toFixed(3)} ${selectedToken}`, [multiplier, selectedToken, stakeAmount]);
  const roundLabel = useMemo(() => {
    if (roundState === "kicking") return "Kickoff";
    if (roundState === "live") return "Live";
    if (roundState === "waiting") return `${betCountdown}s to start`;
    return "Ended";
  }, [betCountdown, roundState]);
  const statusText = useMemo(() => {
    if (roundState === "waiting") return "Powering up";
    if (roundState === "kicking") return "Kickoff";
    if (roundState === "live") return activeGame.id === "kickcrash" ? "Ball in flight" : "Chasing the cup";
    if (roundState === "crashed") return activeGame.crashText;
    return "Cashed out";
  }, [activeGame.crashText, activeGame.id, roundState]);
  const canJoinRound = roundState === "waiting";
  const canCashOut = roundState === "live";

  return (
    <section id="games" className="relative overflow-hidden bg-[#080a08] px-4 py-12 md:py-20">
      <img
        src="/arcade.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />
      <div className="absolute inset-0 bg-black/72" />
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/35 to-black" />
      <div className="absolute inset-0 stadium-grid opacity-10" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col justify-between gap-3 md:mb-8 md:flex-row md:items-end md:gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase text-limeX">
              <Gamepad2 size={17} />
              Two game modes
            </p>
            <h2 className="text-4xl font-black tracking-normal md:text-5xl">World Cup Crash Arena</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-white/58">
            One reusable multiplier engine powers KickCrash and Cup Chase. Wallet connection unlocks staking, game history, and later on-chain settlement.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] md:gap-5">
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {games.map((game) => (
              <button
                key={game.id}
                onClick={() => onSelectGame(game)}
                className={`relative aspect-square overflow-hidden rounded border p-0 text-left transition ${
                  activeGame.id === game.id ? "border-limeX/70 ring-1 ring-limeX/35" : "border-white/10"
                }`}
              >
                <img
                  src={game.id === "kickcrash" ? "/kick%20crash.png" : "/cup%20chase.png"}
                  alt={game.name}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                  draggable={false}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 py-3">
                  <p className="text-[9px] font-semibold uppercase text-white/60">{game.kicker}</p>
                  <h3 className="text-sm font-black text-white sm:text-base">{game.name}</h3>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden gap-5 md:grid">
            {games.map((game) => (
              <article
                key={game.id}
                onClick={() => onSelectGame(game)}
                className={`cursor-pointer rounded border p-5 transition ${
                  activeGame.id === game.id ? "border-limeX/60 bg-limeX/[0.06]" : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white/50">{game.kicker}</p>
                    <h3 className="mt-1 text-2xl font-black">{game.name}</h3>
                  </div>
                  <span className="rounded bg-white px-2 py-1 text-xs font-black text-black">{game.status}</span>
                </div>
                <p className="mb-5 text-sm leading-6 text-white/62">{game.description}</p>
                <div className="mb-5 flex flex-wrap gap-2">
                  {game.history.map((round) => (
                    <span key={round} className="rounded border border-white/10 bg-black/35 px-2 py-1 text-xs text-white/70">
                      {round}
                    </span>
                  ))}
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectGame(game);
                  }}
                  disabled={!canJoinRound}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-limeX disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35"
                >
                  <Play size={16} />
                  {activeGame.id === game.id ? "Selected" : `Select ${game.name}`}
                </button>
              </article>
            ))}
          </div>

          <div className="rounded border border-white/10 bg-[#0d120d] p-4 shadow-glow md:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 md:mb-5 md:gap-3">
              <div>
                <p className="text-sm font-semibold text-white/50">Now selected</p>
                <h3 className="text-3xl font-black">{activeGame.name}</h3>
              </div>
              <div className="rounded border border-white/10 bg-black px-3 py-2 text-sm font-bold text-white/70">
                {account ? shorten(account) : "Wallet required"}
              </div>
            </div>

            <div className="relative mb-2.5 min-h-[18rem] overflow-hidden rounded border border-white/10 bg-black md:mb-3 md:min-h-[21rem]">
              <div className="absolute inset-0 z-0 stadium-grid opacity-20" />
              <div className={`absolute inset-x-0 bottom-0 z-0 h-24 bg-gradient-to-r ${activeGame.accent} opacity-25 blur-xl`} />
              {activeGame.id === "kickcrash" && (
                <>
                  <KickCrashMedia roundState={roundState} onKickoffComplete={onKickoffComplete} onCrashComplete={onCrashComplete} />
                  <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/45 via-transparent to-black/25" />
                  {roundState === "crashed" && (
                    <div className="absolute right-8 top-20 z-20 rotate-[-6deg] text-4xl font-black uppercase text-ember drop-shadow-[0_4px_0_rgba(0,0,0,0.85)] md:text-6xl">
                      Crashed!
                    </div>
                  )}
                  {roundState === "waiting" && (
                    <div className="absolute right-5 top-5 z-20 rounded border border-limeX/40 bg-black/70 px-4 py-3 text-right shadow-glow backdrop-blur-sm">
                      <p className="text-xs font-black uppercase text-limeX">Betting closes in</p>
                      <p className="text-4xl font-black text-white">{betCountdown}s</p>
                    </div>
                  )}
                </>
              )}
              {activeGame.id === "cupchase" && (
                <>
                  <CupChaseMedia roundState={roundState} />
                  <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/50 via-transparent to-black/20" />
                  {roundState === "crashed" && (
                    <div className="absolute right-8 top-20 z-20 rotate-[-6deg] text-4xl font-black uppercase text-ember drop-shadow-[0_4px_0_rgba(0,0,0,0.85)] md:text-5xl">
                      Trophy Escaped!
                    </div>
                  )}
                  {roundState === "waiting" && (
                    <div className="absolute right-5 top-5 z-20 rounded border border-limeX/40 bg-black/70 px-4 py-3 text-right shadow-glow backdrop-blur-sm">
                      <p className="text-xs font-black uppercase text-limeX">Betting closes in</p>
                      <p className="text-4xl font-black text-white">{betCountdown}s</p>
                    </div>
                  )}
                </>
              )}
              <div className="absolute left-8 top-8 z-20 flex gap-2">
                {activeGame.history.map((item) => (
                  <span key={item} className="rounded bg-white/10 px-2 py-1 text-xs font-bold text-white/60">
                    {item}
                  </span>
                ))}
              </div>

              <div className={`absolute left-1/2 top-1/2 z-20 grid -translate-x-1/2 -translate-y-1/2 place-items-center text-center ${["kickcrash", "cupchase"].includes(activeGame.id) ? "rounded border border-white/10 bg-black/55 px-8 py-6 backdrop-blur-sm" : ""}`}>
                <div className={`mb-6 grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br ${activeGame.accent} text-black shadow-gold ${["kickcrash", "cupchase"].includes(activeGame.id) ? "hidden" : ""}`}>
                  {activeGame.id === "kickcrash" ? <Flame size={46} /> : <Trophy size={46} />}
                </div>
                <div className="text-6xl font-black text-white">{multiplier.toFixed(2)}x</div>
                <div className={`mt-3 text-lg font-black ${roundState === "crashed" ? "text-ember" : roundState === "cashed" ? "text-limeX" : "text-white/60"}`}>
                  {statusText}
                </div>
              </div>
            </div>

            {["kickcrash", "cupchase"].includes(activeGame.id) && (
              <div className="mb-3 grid grid-cols-2 gap-1.5 md:grid-cols-4 md:gap-3">
                {[
                  ["Round", roundLabel],
                  ["Auto cashout", activeGame.id === "cupchase" ? "1.85x" : "2.00x"],
                  ["Potential win", potentialWin],
                  ["Arena edge", `${KICKCRASH_BUILDER_EDGE_PERCENT}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded border border-white/10 bg-black/35 px-2.5 py-2.5 md:px-3 md:py-3">
                    <p className="text-[10px] font-bold uppercase text-white/40 sm:text-xs">{label}</p>
                    <p className="mt-1 text-[11px] font-black text-white sm:text-sm">{value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-2 rounded border border-white/10 bg-black/35 p-2 md:grid-cols-[1fr_0.8fr_1fr_1fr] md:gap-3 md:p-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase text-white/50 sm:mb-2 sm:text-xs">Stake</span>
                <input
                  value={stake}
                  onChange={(event) => onStakeChange(event.target.value)}
                  className="h-10 w-full rounded border border-white/10 bg-white/[0.04] px-2.5 text-sm text-white outline-none focus:border-limeX sm:h-12 sm:px-3"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase text-white/50 sm:mb-2 sm:text-xs">Token</span>
                <select
                  value={selectedToken}
                  onChange={(event) => onTokenChange(event.target.value as Token)}
                  className="h-10 w-full appearance-none rounded border border-limeX/60 bg-limeX px-2.5 text-sm font-black text-black outline-none focus:border-limeX sm:h-12 sm:px-3"
                >
                  {tokenOptions.map((token) => (
                    <option key={token}>{token}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2 md:contents">
                <div className="flex items-end md:contents">
                  <button
                    onClick={() => onStart(activeGame)}
                    disabled={!canJoinRound}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-white px-3 text-xs font-black text-black transition hover:bg-limeX disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35 sm:h-12 sm:px-4 sm:text-sm md:h-12"
                  >
                    <Play size={15} className="sm:size-[17px]" />
                    Join Round
                  </button>
                </div>
                <div className="flex items-end md:contents">
                  <button
                    disabled={!canCashOut}
                    onClick={onCashOut}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-limeX px-3 text-xs font-black text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35 sm:h-12 sm:px-4 sm:text-sm md:h-12"
                  >
                    <Coins size={15} className="sm:size-[17px]" />
                    Cash Out
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3 rounded border border-white/10 bg-black/35 p-3 text-sm text-white/72 md:p-4">
              {currentGameTicket ? (
                <>
                  <p className="text-xs font-bold uppercase text-limeX">Active ticket</p>
                  <p className="mt-1 font-semibold">
                    {currentGameTicket.gameName} - {currentGameTicket.stake} {currentGameTicket.token}
                  </p>
                  <p className="mt-1 break-all text-white/45">On-chain tx: {currentGameTicket.joinTxHash ? `${currentGameTicket.joinTxHash.slice(0, 12)}...` : "Pending"}</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase text-white/45">Ticket status</p>
                  <p className="mt-1">Use the game button to join the next round, then cash out during live play.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketsSection({
  selectedToken,
  onTokenChange,
  account,
  placedPredictions,
  onPlacedPrediction,
  onSubmitParticipation,
  onConnectWallet,
}: {
  selectedToken: Token;
  onTokenChange: (token: Token) => void;
  account: string;
  placedPredictions: PlacedPrediction[];
  onPlacedPrediction: React.Dispatch<React.SetStateAction<PlacedPrediction[]>>;
  onSubmitParticipation: (args: {
    kind: "game" | "prediction";
    scope: string;
    label: string;
    token: Token;
    amount: string;
    outcomeId?: number;
  }) => Promise<string | void>;
  onConnectWallet: () => void;
}) {
  const predictionTabs = ["Live World Cup", "Match Winner", "Exact Score", "Top Scorer", "Group Futures"];
  const [activePredictionTab, setActivePredictionTab] = useState(predictionTabs[0]);
  const [showMorePredictions, setShowMorePredictions] = useState(false);
  const [selection, setSelection] = useState<PredictionSelection | null>(null);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [predictionStake, setPredictionStake] = useState("10");
  const tabMarkets = {
    "Live World Cup": [
      {
        match: "Mexico vs South Africa",
        time: "Opening match - Group A",
        pool: "912.4 OKB",
        volume: "$51.2K",
        closes: "Jun 11",
        options: [
          { label: "Mexico", odds: "51%", price: "0.51" },
          { label: "Draw", odds: "27%", price: "0.27" },
          { label: "South Africa", odds: "22%", price: "0.22" },
        ],
      },
      {
        match: "Canada vs Bosnia and Herzegovina",
        time: "Group B",
        pool: "644.9 OKB",
        volume: "$36.4K",
        closes: "Jun 12",
        options: [
          { label: "Canada", odds: "38%", price: "0.38" },
          { label: "Draw", odds: "25%", price: "0.25" },
          { label: "Bosnia and Herzegovina", odds: "37%", price: "0.37" },
        ],
      },
      {
        match: "USA vs Paraguay",
        time: "Group D",
        pool: "1,108.0 OKB",
        volume: "$72.9K",
        closes: "Jun 12",
        options: [
          { label: "USA", odds: "47%", price: "0.47" },
          { label: "Draw", odds: "24%", price: "0.24" },
          { label: "Paraguay", odds: "29%", price: "0.29" },
        ],
      },
    ],
    "Match Winner": markets,
    "Exact Score": [
      {
        match: "Brazil vs Morocco",
        time: "Group C exact score",
        pool: "388.2 OKB",
        volume: "$18.7K",
        closes: "Jun 13",
        options: [
          { label: "Brazil 2-1", odds: "18%", price: "0.18" },
          { label: "Brazil 1-0", odds: "15%", price: "0.15" },
          { label: "Draw 1-1", odds: "14%", price: "0.14" },
        ],
      },
      {
        match: "England vs Croatia",
        time: "Group L exact score",
        pool: "421.6 OKB",
        volume: "$24.0K",
        closes: "Jun 17",
        options: [
          { label: "England 2-1", odds: "17%", price: "0.17" },
          { label: "Draw 1-1", odds: "16%", price: "0.16" },
          { label: "Croatia 1-0", odds: "11%", price: "0.11" },
        ],
      },
      {
        match: "France vs Senegal",
        time: "Group I exact score",
        pool: "510.7 OKB",
        volume: "$30.6K",
        closes: "Jun 16",
        options: [
          { label: "France 2-0", odds: "19%", price: "0.19" },
          { label: "France 2-1", odds: "17%", price: "0.17" },
          { label: "Draw 1-1", odds: "13%", price: "0.13" },
        ],
      },
    ],
    "Top Scorer": [
      {
        match: "Golden Boot winner",
        time: "Tournament player market",
        pool: "1,492.3 OKB",
        volume: "$86.8K",
        closes: "Before opening match",
        options: [
          { label: "Kylian Mbappe", odds: "18%", price: "0.18" },
          { label: "Harry Kane", odds: "14%", price: "0.14" },
          { label: "Erling Haaland", odds: "12%", price: "0.12" },
        ],
      },
      {
        match: "Most assists",
        time: "Tournament player market",
        pool: "706.5 OKB",
        volume: "$41.3K",
        closes: "Before opening match",
        options: [
          { label: "Lionel Messi", odds: "13%", price: "0.13" },
          { label: "Bruno Fernandes", odds: "11%", price: "0.11" },
          { label: "Jude Bellingham", odds: "10%", price: "0.10" },
        ],
      },
      {
        match: "Young player award",
        time: "Tournament award market",
        pool: "532.0 OKB",
        volume: "$25.8K",
        closes: "Before opening match",
        options: [
          { label: "Lamine Yamal", odds: "24%", price: "0.24" },
          { label: "Endrick", odds: "13%", price: "0.13" },
          { label: "Kobbie Mainoo", odds: "9%", price: "0.09" },
        ],
      },
    ],
    "Group Futures": [
      {
        match: "Group A winner",
        time: "Mexico, South Africa, Korea Republic, Czechia",
        pool: "620.3 OKB",
        volume: "$33.5K",
        closes: "Jun 11",
        options: [
          { label: "Mexico", odds: "39%", price: "0.39" },
          { label: "Korea Republic", odds: "29%", price: "0.29" },
          { label: "Czechia", odds: "23%", price: "0.23" },
        ],
      },
      {
        match: "Group L winner",
        time: "England, Croatia, Ghana, Panama",
        pool: "778.1 OKB",
        volume: "$46.2K",
        closes: "Jun 17",
        options: [
          { label: "England", odds: "47%", price: "0.47" },
          { label: "Croatia", odds: "28%", price: "0.28" },
          { label: "Ghana", odds: "17%", price: "0.17" },
        ],
      },
      {
        match: "Group I winner",
        time: "France, Senegal, Norway, Iraq",
        pool: "864.8 OKB",
        volume: "$52.7K",
        closes: "Jun 16",
        options: [
          { label: "France", odds: "46%", price: "0.46" },
          { label: "Senegal", odds: "24%", price: "0.24" },
          { label: "Norway", odds: "22%", price: "0.22" },
        ],
      },
    ],
  };
  const visibleMarkets = tabMarkets[activePredictionTab as keyof typeof tabMarkets];
  const potentialReturn = selection ? (Number(predictionStake || 0) / Math.max(Number(selection.price), 0.01)).toFixed(2) : "0.00";

  async function placePrediction() {
    if (!selection) return;
    if (!account) {
      onConnectWallet();
      return;
    }
    try {
      const txHash = await onSubmitParticipation({
        kind: "prediction",
        scope: selection.market,
        label: `prediction: ${selection.market} / ${selection.option}`,
        token: selectedToken,
        amount: predictionStake,
        outcomeId: selection.outcomeId,
      });
      onPlacedPrediction((current) => [
        {
          ...selection,
          id: `${selection.market}-${selection.option}-${Date.now()}`,
          stake: predictionStake,
          token: selectedToken,
          status: "Open",
          txHash: txHash ?? "",
        },
        ...current,
      ]);
      setIsTicketOpen(false);
    } catch {
      // message is handled by the on-chain participation helper
    }
  }

  function openTicket(nextSelection: PredictionSelection) {
    setSelection(nextSelection);
    setIsTicketOpen(true);
  }
  const morePredictionGroups = [
    {
      title: "Card & Discipline Markets",
      markets: [
        ["England vs Croatia", "Over 4.5 cards", "57%"],
        ["Argentina vs Algeria", "Red card shown", "18%"],
        ["Uruguay group stage", "Most cards in Group H", "31%"],
      ],
    },
    {
      title: "Goal Timing Markets",
      markets: [
        ["Mexico vs South Africa", "First goal before 30:00", "44%"],
        ["Brazil vs Morocco", "Both halves to have a goal", "39%"],
        ["France vs Senegal", "Goal in stoppage time", "16%"],
      ],
    },
    {
      title: "Team Milestones",
      markets: [
        ["USA", "Reach Round of 16", "63%"],
        ["Canada", "Win a group-stage match", "52%"],
        ["Ghana", "Qualify from Group L", "34%"],
      ],
    },
    {
      title: "Player Specials",
      markets: [
        ["Mbappe", "Score 5+ tournament goals", "22%"],
        ["Kane", "Score in opening match", "31%"],
        ["Messi", "Record 2+ assists", "28%"],
      ],
    },
  ];

  return (
    <section id="prediction-markets" className="relative overflow-hidden bg-[#0b100d] px-4 py-12 md:py-20">
      <img
        src="/predict.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />
      <div className="absolute inset-0 bg-black/76" />
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/45 to-[#0b100d]" />
      <div className="absolute inset-0 stadium-grid opacity-10" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col justify-between gap-3 md:mb-8 md:flex-row md:items-end md:gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase text-trophy">
              <Medal size={17} />
              Prediction markets
            </p>
            <h2 className="text-4xl font-black tracking-normal md:text-5xl">Bet the match before kickoff</h2>
          </div>
          <div className="flex items-center gap-2 rounded border border-white/10 bg-black/35 px-3 py-2">
            <span className="text-sm text-white/50">Token</span>
            <select
              value={selectedToken}
              onChange={(event) => onTokenChange(event.target.value as Token)}
              className="appearance-none rounded border border-limeX/60 bg-limeX px-2 py-1 text-sm font-black text-black outline-none"
            >
              {tokenOptions.map((token) => (
                <option key={token}>{token}</option>
              ))}
            </select>
            <ChevronDown size={15} className="text-white/45" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr] md:gap-5">
          <article className="rounded border border-limeX/25 bg-black/60 p-4 shadow-glow backdrop-blur-sm md:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 md:mb-5 md:gap-4">
              <div>
                <p className="text-sm font-bold uppercase text-limeX">Featured market</p>
                <h3 className="mt-1 text-3xl font-black md:text-4xl">Who wins the World Cup Final?</h3>
              </div>
              <div className="rounded border border-white/10 bg-white/[0.06] px-3 py-2 text-right">
                <p className="text-xs font-bold uppercase text-white/40">Total pool</p>
                <p className="text-lg font-black text-white">1,274.2 OKB</p>
              </div>
            </div>

            <div className="grid gap-2.5 md:gap-3">
              {[
                { label: "France lifts the trophy", odds: 39, pool: "496.9 OKB" },
                { label: "Portugal lifts the trophy", odds: 34, pool: "433.2 OKB" },
                { label: "Brazil lifts the trophy", odds: 27, pool: "344.1 OKB" },
              ].map((option, optionIndex) => (
                <button
                  key={option.label}
                  onClick={() =>
                    openTicket({
                      market: "Who wins the World Cup Final?",
                      option: option.label,
                      odds: `${option.odds}%`,
                      price: (option.odds / 100).toFixed(2),
                      outcomeId: optionIndex,
                    })
                  }
                  className="group rounded border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-limeX/60 hover:bg-limeX/10 md:p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="font-black text-white">{option.label}</span>
                    <span className="rounded bg-white px-2 py-1 text-sm font-black text-black">{option.odds}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-limeX" style={{ width: `${option.odds}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-white/50">
                    <span>Pool {option.pool}</span>
                    <span>{account ? `Stake ${selectedToken}` : "Connect wallet to stake"}</span>
                  </div>
                </button>
              ))}
            </div>
          </article>

          <aside className="rounded border border-white/10 bg-black/55 p-4 backdrop-blur-sm md:p-5">
            <p className="text-sm font-bold uppercase text-white/45">Market stats</p>
            <div className="mt-3 grid grid-cols-2 gap-2.5 md:mt-4 md:grid-cols-1 md:gap-3">
              {[
                ["World Cup volume", "$90.5K"],
                ["Open markets", "12"],
                ["Avg liquidity", "583 OKB"],
                ["Default token", selectedToken],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center md:flex md:items-center md:justify-between md:px-4 md:py-3 md:text-left">
                  <span className="block text-[10px] text-white/50 md:text-sm">{label}</span>
                  <strong className="mt-1 block text-sm md:mt-0">{value}</strong>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded border border-trophy/25 bg-trophy/10 p-3 md:mt-5 md:p-4">
              <p className="text-sm font-bold text-trophy">World Cup only</p>
              <p className="mt-2 text-sm leading-6 text-white/62">
                Markets are scoped to match winners, trophy futures, exact scorelines, and player awards for the tournament.
              </p>
            </div>
          </aside>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 md:mt-6">
          {predictionTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActivePredictionTab(tab)}
              className={`rounded border px-3 py-1.5 text-xs font-bold md:px-4 md:py-2 md:text-sm ${
                activePredictionTab === tab ? "border-limeX/60 bg-limeX text-black" : "border-white/10 bg-black/35 text-white/65 hover:border-limeX/40"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 md:mt-5 md:gap-4 md:overflow-visible md:pb-0">
          {visibleMarkets.map((market) => (
            <article key={market.match} className="min-w-[18rem] shrink-0 rounded border border-white/10 bg-black/55 p-3 backdrop-blur-sm md:min-w-0 md:p-5">
              <div className="mb-3 flex items-start justify-between gap-3 md:mb-4 md:gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-white/50 md:text-sm">{market.time}</p>
                  <h3 className="mt-1 text-lg font-black leading-tight md:text-2xl">{market.match}</h3>
                </div>
                <Trophy size={18} className="text-limeX md:size-[22px]" />
              </div>
              <div className="mb-3 grid grid-cols-3 gap-1.5 rounded border border-white/10 bg-black/35 p-2 md:mb-4 md:gap-2 md:p-3">
                <div className="flex items-center justify-between text-[10px] md:text-sm">
                  <span className="text-white/50">Pool</span>
                  <strong>{market.pool}</strong>
                </div>
                <div className="text-[10px] md:text-sm">
                  <p className="text-white/50">Volume</p>
                  <strong>{market.volume}</strong>
                </div>
                <div className="text-[10px] md:text-sm">
                  <p className="text-white/50">Deadline</p>
                  <strong>{market.closes}</strong>
                </div>
              </div>

              <div className="grid gap-1 md:gap-2">
                {market.options.map((option, optionIndex) => (
                  <button
                    key={option.label}
                    onClick={() =>
                      openTicket({
                        market: market.match,
                        option: option.label,
                        odds: option.odds,
                        price: option.price,
                        outcomeId: optionIndex,
                      })
                    }
                    className={`rounded border px-2.5 py-2 text-left text-[11px] font-bold transition hover:border-limeX/60 hover:bg-limeX/10 md:px-4 md:py-3 md:text-sm ${
                      placedPredictions.some((prediction) => prediction.market === market.match && prediction.option === option.label) ? "border-limeX/60 bg-limeX/10" : "border-white/10 bg-black/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 md:gap-3">
                      <span>{option.label}</span>
                      <span className="text-white/65">{option.odds}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10 md:mt-2">
                      <div className="h-full rounded-full bg-limeX" style={{ width: option.odds }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/40 md:mt-2 md:text-xs">
                      <span>Share {option.price} {selectedToken}</span>
                      <span>{account ? "Stake" : <Lock size={13} />}</span>
                    </div>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 flex justify-center md:mt-8">
          <button
            onClick={() => setShowMorePredictions((current) => !current)}
            className="inline-flex min-h-11 items-center gap-2 rounded border border-limeX/60 bg-limeX px-5 py-2.5 text-sm font-black text-black transition hover:bg-white md:min-h-12 md:px-6 md:py-3"
          >
            <ChevronDown size={17} className={showMorePredictions ? "rotate-180 transition" : "transition"} />
            {showMorePredictions ? "Show Less" : "Explore More Predictions"}
          </button>
        </div>

        {showMorePredictions && (
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-2 md:mt-6 md:gap-4 md:overflow-visible md:pb-0">
            {morePredictionGroups.map((group) => (
              <article key={group.title} className="min-w-[18rem] shrink-0 rounded border border-white/10 bg-black/55 p-3 backdrop-blur-sm md:min-w-0 md:p-5">
                <h3 className="text-sm font-black leading-tight md:text-xl">{group.title}</h3>
                <div className="mt-2 grid gap-1.5 md:mt-4 md:gap-2">
                  {group.markets.map(([market, option, odds], optionIndex) => (
                    <button
                      key={`${market}-${option}`}
                      onClick={() =>
                        openTicket({
                          market,
                          option,
                          odds,
                          price: (Number(odds.replace("%", "")) / 100).toFixed(2),
                          outcomeId: optionIndex,
                        })
                      }
                      className="rounded border border-white/10 bg-white/[0.035] p-2.5 text-left transition hover:border-limeX/50 hover:bg-limeX/10 md:p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-black leading-tight text-white md:text-sm">{market}</p>
                          <p className="mt-0.5 text-[10px] text-white/50 md:mt-1 md:text-sm">{option}</p>
                        </div>
                        <span className="rounded bg-white px-2 py-1 text-[10px] font-black text-black md:text-sm">{odds}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-limeX" style={{ width: odds }} />
                      </div>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3 rounded border border-limeX/30 bg-limeX/[0.06] px-4 py-3 text-sm text-white/68 md:mt-8 md:py-4">
          <CheckCircle2 size={20} className="shrink-0 text-limeX" />
          OKB is the default payment coin. USDC and USDT are available as fallback ERC-20 options, while users still need OKB for X Layer gas unless gas sponsorship is added.
        </div>
      </div>

      {isTicketOpen && selection && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded border border-white/10 bg-[#080d09] p-5 text-white shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase text-limeX">Prediction ticket</p>
                <h3 className="mt-1 text-2xl font-black">{selection.option}</h3>
                <p className="mt-2 text-sm text-white/50">
                  {selection.market} - {selection.odds} implied
                </p>
              </div>
              <button
                onClick={() => setIsTicketOpen(false)}
                className="grid h-9 w-9 place-items-center rounded border border-white/10 bg-white/[0.05] text-lg font-black text-white/70 hover:bg-white/10"
                aria-label="Close prediction ticket"
              >
                ×
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_0.8fr]">
              <label>
                <span className="mb-2 block text-xs font-bold uppercase text-white/45">Stake amount</span>
                <input
                  value={predictionStake}
                  onChange={(event) => setPredictionStake(event.target.value)}
                  className="h-12 w-full rounded border border-white/10 bg-white/[0.05] px-3 text-white outline-none focus:border-limeX"
                />
              </label>
              <div>
                <span className="mb-2 block text-xs font-bold uppercase text-white/45">Token</span>
                <div className="grid h-12 place-items-center rounded border border-white/10 bg-white/[0.05] text-sm font-black">{selectedToken}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded border border-white/10 bg-white/[0.035] px-4 py-3">
                <p className="text-xs font-bold uppercase text-white/40">Share price</p>
                <p className="mt-1 font-black">{selection.price} {selectedToken}</p>
              </div>
              <div className="rounded border border-white/10 bg-white/[0.035] px-4 py-3">
                <p className="text-xs font-bold uppercase text-white/40">Potential shares</p>
                <p className="mt-1 font-black">{potentialReturn}</p>
              </div>
              <div className="rounded border border-white/10 bg-white/[0.035] px-4 py-3">
                <p className="text-xs font-bold uppercase text-white/40">Demo tickets</p>
                <p className="mt-1 font-black">{placedPredictions.length}</p>
              </div>
            </div>

            <button
              onClick={placePrediction}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded bg-limeX px-4 text-sm font-black text-black transition hover:bg-white"
            >
              <Coins size={17} />
              {account ? "Place Prediction" : "Connect Wallet to Place Prediction"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black px-4 py-6 text-white md:py-10">
      <div className="mx-auto max-w-7xl md:hidden">
        <div className="grid grid-cols-2 gap-4">
          <img src="/newlogo.png" alt="oddX Bets" className="h-12 w-auto object-contain" draggable={false} />
          <div className="col-span-2">
            <p className="mt-3 max-w-md text-sm leading-6 text-white/55 md:mt-4">
              oddX Bets is a World Cup prediction and GameFi arena built for X Layer testnet, with OKB-first gameplay and USDC/USDT fallback markets.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-black uppercase text-white/45">Arena</h3>
            <div className="mt-3 grid gap-2 text-sm text-white/65">
              <a href="#games" className="hover:text-limeX">KickCrash</a>
              <a href="#games" className="hover:text-limeX">Cup Chase</a>
              <a href="#prediction-markets" className="hover:text-limeX">World Cup Predictions</a>
            </div>
          </div>

          <div className="justify-self-end text-right">
            <h3 className="text-sm font-black uppercase text-white/45">Network</h3>
            <div className="mt-3 grid gap-2 text-sm text-white/65">
              <p>Powered by X Layer testnet</p>
              <p>Primary token: OKB</p>
              <p>Fallbacks: USDC + USDT</p>
              <p>Arena contract: {ODDX_BETS_ARENA_ADDRESS ? shorten(ODDX_BETS_ARENA_ADDRESS) : "Set env"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto hidden max-w-7xl md:grid md:grid-cols-[1.1fr_0.9fr_0.9fr] md:gap-8">
        <div>
          <img src="/newlogo.png" alt="oddX Bets" className="h-12 w-auto object-contain" draggable={false} />
          <p className="mt-4 max-w-md text-sm leading-6 text-white/55">
            oddX Bets is a World Cup prediction and GameFi arena built for X Layer testnet, with OKB-first gameplay and USDC/USDT fallback markets.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-black uppercase text-white/45">Arena</h3>
          <div className="mt-3 grid gap-2 text-sm text-white/65 md:mt-4">
            <a href="#games" className="hover:text-limeX">KickCrash</a>
            <a href="#games" className="hover:text-limeX">Cup Chase</a>
            <a href="#prediction-markets" className="hover:text-limeX">World Cup Predictions</a>
          </div>
        </div>

        <div className="md:text-right">
          <h3 className="text-sm font-black uppercase text-white/45">Network</h3>
          <div className="mt-3 grid gap-2 text-sm text-white/65 md:mt-4">
            <p>Powered by X Layer testnet</p>
            <p>Primary token: OKB</p>
            <p>Fallbacks: USDC + USDT</p>
            <p>Arena contract: {ODDX_BETS_ARENA_ADDRESS ? shorten(ODDX_BETS_ARENA_ADDRESS) : "Set env"}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-5 flex max-w-7xl flex-col justify-between gap-2 border-t border-white/10 pt-4 text-xs text-white/40 md:mt-8 md:flex-row md:gap-3 md:pt-5">
        <p>© 2026 oddX Bets. Built for the Build X Hackathon.</p>
        <p className="md:text-right">
          Built by <a href="https://x.com/MLdupont" target="_blank" rel="noreferrer" className="text-limeX hover:text-white">@MLdupont</a>{" "}
          <a href="https://github.com/AlgofootPrint" target="_blank" rel="noreferrer" className="text-limeX hover:text-white">GitHub: AlgofootPrint</a>
        </p>
      </div>
    </footer>
  );
}

function MyPredictionsSection({
  placedPredictions,
  account,
}: {
  placedPredictions: PlacedPrediction[];
  account: string;
}) {
  return (
    <section className="relative overflow-hidden bg-[#070b08] px-4 py-12 md:py-20">
      <div className="absolute inset-0 stadium-grid opacity-10" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col justify-between gap-3 md:mb-8 md:flex-row md:items-end md:gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase text-limeX">
              <Wallet size={17} />
              My Predictions
            </p>
            <h2 className="text-4xl font-black tracking-normal md:text-5xl">Your World Cup tickets</h2>
          </div>
          <div className="rounded border border-white/10 bg-black/45 px-3 py-2.5 text-sm font-bold text-white/65 md:px-4 md:py-3">
            {account ? shorten(account) : "Demo wallet view"}
          </div>
        </div>

        {placedPredictions.length === 0 ? (
          <div className="rounded border border-white/10 bg-black/55 p-5 text-center md:p-8">
            <p className="text-2xl font-black">No predictions placed yet</p>
            <p className="mt-2 text-sm text-white/55">Open the Predictions tab and select a World Cup outcome to create your first ticket.</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3 md:gap-4">
            {placedPredictions.map((prediction) => (
              <article key={prediction.id} className="rounded border border-white/10 bg-black/55 p-4 backdrop-blur-sm md:p-5">
                <div className="mb-3 flex items-start justify-between gap-3 md:mb-4">
                  <div>
                    <p className="text-sm font-semibold text-white/50">{prediction.market}</p>
                    <h3 className="mt-1 text-xl font-black">{prediction.option}</h3>
                  </div>
                  <span className="rounded bg-limeX px-2 py-1 text-xs font-black text-black">{prediction.status}</span>
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between rounded border border-white/10 bg-white/[0.04] px-3 py-2">
                    <span className="text-white/50">Stake</span>
                    <strong>{prediction.stake} {prediction.token}</strong>
                  </div>
                  <div className="flex justify-between rounded border border-white/10 bg-white/[0.04] px-3 py-2">
                    <span className="text-white/50">Odds</span>
                    <strong>{prediction.odds}</strong>
                  </div>
                  <div className="flex justify-between rounded border border-white/10 bg-white/[0.04] px-3 py-2">
                    <span className="text-white/50">Share price</span>
                    <strong>{prediction.price} {prediction.token}</strong>
                  </div>
                  <div className="flex justify-between rounded border border-white/10 bg-white/[0.04] px-3 py-2">
                    <span className="text-white/50">Tx hash</span>
                    <strong className="truncate">{prediction.txHash ? `${prediction.txHash.slice(0, 10)}...` : "Pending"}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileSection({
  account,
  walletSource,
  username,
  profileWallet,
  placedPredictions,
  participationFeeTxHash,
}: {
  account: string;
  walletSource: WalletSource | "";
  username: string;
  profileWallet: string;
  placedPredictions: PlacedPrediction[];
  participationFeeTxHash: string;
}) {
  return (
    <section className="relative overflow-hidden bg-[#070b08] px-4 py-12 md:py-20">
      <div className="absolute inset-0 stadium-grid opacity-10" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="rounded border border-white/10 bg-black/60 p-4 backdrop-blur-sm md:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center md:gap-6">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded border border-limeX/40 bg-limeX text-2xl font-black text-black">
                {(username || "M").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold uppercase text-limeX">Profile</p>
                <h2 className="text-4xl font-black">{username || "Unnamed Player"}</h2>
                <p className="mt-1 text-sm text-white/50">
                  {account ? `${walletSource} ${shorten(account)}` : profileWallet ? `Saved wallet ${shorten(profileWallet)}` : "Wallet not connected"}
                </p>
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60">
              Built for matchday Wins
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:mt-8 md:grid-cols-4 md:gap-4">
            {[
              ["Predictions", placedPredictions.length.toString()],
              ["Open tickets", placedPredictions.filter((prediction) => prediction.status === "Open").length.toString()],
              ["Favorite token", "OKB"],
              ["Network", "X Layer"],
              ["Participation tx", participationFeeTxHash ? `${participationFeeTxHash.slice(0, 10)}...` : "Pending"],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-white/10 bg-white/[0.035] p-3 md:p-4">
                <p className="text-xs font-bold uppercase text-white/40">{label}</p>
                <p className="mt-2 text-2xl font-black">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default App;

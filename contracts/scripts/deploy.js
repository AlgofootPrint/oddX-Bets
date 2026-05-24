require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const supportedTokens = (process.env.SUPPORTED_TOKENS || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  console.log("Deploying OddXBetsArena...");
  console.log("Deployer:", deployer.address);
  console.log("Network: ", hre.network.name);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance: ", hre.ethers.formatEther(balance), "OKB\n");

  const OddXBetsArena = await hre.ethers.getContractFactory("OddXBetsArena");
  const arena = await OddXBetsArena.deploy(supportedTokens);
  await arena.waitForDeployment();

  const address = await arena.getAddress();
  console.log("✅ OddXBetsArena deployed!");
  console.log("Contract address:", address);
  console.log("Explorer:        https://www.okx.com/explorer/xlayer/address/" + address);
  console.log("\nAdd to .env:");
  console.log(`ODDX_BETS_CONTRACT=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

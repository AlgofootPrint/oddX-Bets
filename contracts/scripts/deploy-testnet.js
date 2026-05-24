require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying testnet demo stack...");
  console.log("Deployer:", deployer.address);
  console.log("Network: ", hre.network.name);

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");

  const usdc = await MockERC20.deploy("oddX USDC", "USDC", 6);
  await usdc.waitForDeployment();

  const usdt = await MockERC20.deploy("oddX USDT", "USDT", 6);
  await usdt.waitForDeployment();

  const usdcAddress = await usdc.getAddress();
  const usdtAddress = await usdt.getAddress();

  const mintAmount = hre.ethers.parseUnits("1000000", 6);
  await (await usdc.mint(deployer.address, mintAmount)).wait();
  await (await usdt.mint(deployer.address, mintAmount)).wait();

  const OddXBetsArena = await hre.ethers.getContractFactory("OddXBetsArena");
  const arena = await OddXBetsArena.deploy([usdcAddress, usdtAddress]);
  await arena.waitForDeployment();

  const arenaAddress = await arena.getAddress();

  console.log("\n✅ Deployed addresses");
  console.log("OddXBetsArena:", arenaAddress);
  console.log("Mock USDC:    ", usdcAddress);
  console.log("Mock USDT:    ", usdtAddress);
  console.log("\nAdd these to the frontend .env:");
  console.log(`VITE_ODDX_BETS_CONTRACT=${arenaAddress}`);
  console.log(`VITE_XLAYER_TESTNET_USDC=${usdcAddress}`);
  console.log(`VITE_XLAYER_TESTNET_USDT=${usdtAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

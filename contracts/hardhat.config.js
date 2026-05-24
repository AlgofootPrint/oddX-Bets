require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    xlayer: {
      url: "https://rpc.xlayer.tech",
      chainId: 196,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
    xlayer_testnet: {
      url: "https://testrpc.xlayer.tech",
      chainId: 1952,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

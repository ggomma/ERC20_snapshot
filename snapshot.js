const fs = require('fs');
const Web3 = require('web3');
const sleep = require('sleep');
const BigNumber = require('bignumber.js').BigNumber;
const ABI = require('./ABI');
const config = require('./config');

// Use infura network
const web3 = new Web3(new Web3.providers.HttpProvider(
  `https://mainnet.infura.io/v3/${config.infuraKey}`
));
const contract = new web3.eth.Contract(ABI, config.contractAddr);

let targetBlockNumber = config.targetBlockNumber;
let totalSupply = new BigNumber("0");
let totalHolders = 0;


const init = async () => {
  // clear file
  fs.writeFileSync('./result.csv', '');

  if (!targetBlockNumber) {
    const { number } = await web3.eth.getBlock('latest');
    targetBlockNumber = number;
  }
};

const getHolderList = async () => {
  let holderList = [];

  const step = 10000; // step is required to avoid errors
  for (let i = config.eventParse.fromBlock; i <= targetBlockNumber + step; i += step) {
    const toBlock = i + step - 1 > targetBlockNumber ? targetBlockNumber : i + step - 1;
    await contract.getPastEvents('Transfer', { fromBlock: i, toBlock: toBlock })
      .then((events) => {
        for (let k = 0; k < events.length; k += 1) {
          const e = events[k];
          const addr1 = e.returnValues.from.toLowerCase();
          const addr2 = e.returnValues.to.toLowerCase();
          const addr3 = e.raw.topics[2].replace('000000000000000000000000', '').toLowerCase();
          if (!holderList.includes(addr1)) holderList.push(addr1);
          if (!holderList.includes(addr2)) holderList.push(addr2);
          if (!holderList.includes(addr3)) holderList.push(addr3);
        }
        return true;
      })
      .catch(err => {
        throw err;
      })
      .then(() => {
        const percentage = ((i - config.eventParse.fromBlock) / (targetBlockNumber - config.eventParse.fromBlock) * 100).toFixed(2);
        console.log(`From ${i} ~ to ${toBlock} || ${percentage}%`);
      });
  }
  holderList = holderList.filter((v, i) => holderList.indexOf(v) === i);
  return holderList;
};

const balanceChecker = (addr) => contract.methods.balanceOf(addr).call({}, config.targetBlockNumber);

const balanceConverter = (balance) => {
  const convertedBalance = new BigNumber(balance).dividedBy(10 ** config.decimals);
  totalSupply = totalSupply.plus(convertedBalance);
  return convertedBalance.toString();
};

const writeHolderInfo = async (holder) => {
  const rawBalance = await balanceChecker(holder);
  if (rawBalance === '0') return false;

  const convertedBalance = balanceConverter(rawBalance);
  fs.appendFileSync('./result.csv', `${holder},${convertedBalance}\n`);
  return true;
}

const holderNumberChecker = (totalHolders) => {
  if (totalHolders !== config.holders) {
    throw new Error(`Holder Number || Expected : ${config.holders}, Actual : ${totalHolders}`);
  }
  return true;
}

const totalSupplyChecker = () => {
  if (+totalSupply !== +config.totalSupply) {
    throw new Error(`Total Supply || Expected : ${config.totalSupply}, Actual : ${totalSupply}`);
  }
  return true;
};

init()
  .then(() => getHolderList())
  .then(async (holderList) => {
    const promises = holderList.map(async (holder) => {
      const result = await writeHolderInfo(holder);
      if (result) totalHolders += 1;
    });
    await Promise.all(promises);

    totalSupplyChecker();
    holderNumberChecker(totalHolders);
    console.log("=== FINISHED ===");
  })
  .catch(console.log);

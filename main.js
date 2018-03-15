"use strict"
const request = require('request')
const naiveChain = require('./naiveChain')
const CryptoJS = require("crypto-js")

// send testament to blockchain
const sendDataToBlockchain = (mydata, secret) => {
  const options = {
    url: `http://localhost:${http_port}/mineBlock`,
    form: {
      data: encryptData(mydata, secret)
    }
  }
  request.post(options, (error, response, body) => {
    return response.index
  })
}

// get testament from blockchain
const getDataFromBlockchain = (myIndex, secret) => {
  request.get(
    {
      url: `http://localhost:${http_port}/blocks`,
      json: true
    },
    (error, response, body) => {
      if (error) console.log(error)
      const block = body.filter(b => b.index === myIndex)
      const message = decrpytData(block[0], secret)
      console.log(message)
      return message
    }
  )
}

const decrpytData = (block, secret) => CryptoJS.AES.decrypt(block.data, secret).toString(CryptoJS.enc.Utf8)

const encryptData = (data, secret) =>  CryptoJS.AES.encrypt(data, secret).toString()

let blockchain = []
const sockets = []
const MessageType = {
  QUERY_LATEST: 0,
  QUERY_ALL: 1,
  RESPONSE_BLOCKCHAIN: 2
}

const secret = CryptoJS.lib.WordArray.random(128 / 8).words[1].toString()
const genesisBlock = naiveChain.getGenesisBlock(encryptData("my genesis block!!", secret))
blockchain.push(genesisBlock)


const initialPeers = process.env.PEERS ? process.env.PEERS.split(",") : []
const http_port = process.env.HTTP_PORT || 3001
const p2p_port = process.env.P2P_PORT || 6001

naiveChain.connectToPeers(initialPeers)
naiveChain.initHttpServer(blockchain, sockets, MessageType, http_port)
naiveChain.initP2PServer(blockchain, sockets, MessageType, p2p_port)

console.log(sendDataToBlockchain("Ravi", secret))
console.log(sendDataToBlockchain("Marilyn", secret))
console.log(sendDataToBlockchain("Claudia", secret))
console.log(sendDataToBlockchain("Benjamin", secret))
console.log(getDataFromBlockchain(1, secret))

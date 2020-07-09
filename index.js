require('dotenv').config()

const Discord = require('discord.js');
const bot = new Discord.Client();

const request = require('request')
const jsonfile = require('jsonfile')
const path = require('path')

const TOKEN = process.env.TOKEN;

let coinObjects = []
let timer = 60

bot.login(TOKEN);

bot.on('ready', function() {

    loadCoins()

    bot.user.setUsername("PriceBot")
})

bot.on('message', async function(message) {

    if(message.content.startsWith('!check')) {

        let args = message.content.split(' ')

        if(args.length < 2) return message.channel.send(`${message.author} Not enough arguments, !check <coin-name>`)

        let coin = getCoinObjectByName(args[1])

        if(coin === null) return message.channel.send(`${message.author} couldn't find that coin in the watchlist, if you want to add a new coin do !add <coin-name>`)

        coin = coin.coin

        let response = await checkPrice(args[1]).catch(err => console.log(err))

        coin.lastprice = coin.currentprice
        coin.currentprice = response
        coin.difference = ((coin.currentprice - coin.lastprice) / coin.currentprice) * 100

        if(coin.lastprice !== -1) {
            
            message.channel.send(priceCheckEmbed(coin))

        } else {
            message.channel.send(`Current Price: ${coin.currentprice}`)
        }

  
    }

    if(message.content.startsWith('!add')) {
    
        let args = message.content.split(' ')

        if(args.length < 2) return message.channel.send(`${message.author} Not enough arguments, !add <coin-name>`)

        if(getCoinObjectByName(args[1]) !== null) return message.channel.send(`${message.author} That coin is already on the watchlist`)

        coinObjects.push({
            name: args[1],
            lastprice: -1,
            currentprice: -1,
            difference: 0,
            limit: 0
        })

        jsonfile.writeFile(path.join(__dirname, 'coinlist.json'), {"coins": coinObjects}, function(err) {
            if(err) return console.log("Error while writing to json file")
        })

    }

    if(message.content.startsWith('!remove')) {
    
        let args = message.content.split(' ')

        if(args.length < 2) return message.channel.send(`${message.author} Not enough arguments, !remove <coin-name>`)

        let coin = getCoinObjectByName(args[1])

        if(coin === null) return message.channel.send(`${message.author} That coin is not on the watchlist`)

        coinObjects.splice(coin.index, 1)

 
        jsonfile.writeFile(path.join(__dirname, 'coinlist.json'), {"coins": coinObjects}, function(err) {
            if(err) return console.log("Error while writing to json file")
        })

        message.channel.send(`${message.author} Removed ${args[1]} from the watchlist`)

    }

    if(message.content.startsWith('!limit')) {
    
        let args = message.content.split(' ')

        if(args.length < 3) return message.channel.send(`${message.author} Not enough arguments, !limit <coin-name> <limit>`)

        let coin = getCoinObjectByName(args[1])

        if(coin === null) return message.channel.send(`${message.author} That coin is not on the watchlist`)

        coin.coin.limit = args[2]

        coinObjects.splice(coin.index, 1)
        coinObjects.push(coin.coin)

        jsonfile.writeFile(path.join(__dirname, 'coinlist.json'), {"coins": coinObjects}, function(err) {
            if(err) return console.log("Error while writing to json file")
        })

        message.channel.send(`${message.author} Set the limit for ${args[1]} to ${args[2]}`)

    }

    if(message.content.startsWith('!showall')) {
        message.channel.send(allCoinsEmbed())
    }

    if(message.content.startsWith('!settime')) {
    
        let args = message.content.split(' ')

        if(args.length < 2) return message.channel.send(`${message.author} Not enough arguments, !settime <time>`)

        timer = parseInt(args[1])

        message.channel.send(`${message.author} Prices will be checked once every ${timer} minute(s) now`)

    }
    
})

function run() {

    setInterval(() => {

        checkAllPrice()

    }, 1000 * 60 * timer)

}

function loadCoins() {
    jsonfile.readFile(path.join(__dirname, 'coinlist.json'), function(error, obj) {
        
        if(error) return console.log("[ReadFileError]", error)

        if(obj.coins.length > 0) {

            for(var i = 0; i < obj.coins.length; i++) {
                coinObjects.push({
                    name: obj.coins[i].name,
                    lastprice: obj.coins[i].lastprice,
                    currentprice: obj.coins[i].currentprice,
                    difference: obj.coins[i].difference,
                    limit: obj.coins[i].limit
                })
            }
        }

        run()

        checkAllPrice()

        console.log(`Loaded in ${obj.coins.length} coins.`)

    })
}

function priceCheckEmbed(coin) {
    return new Discord.MessageEmbed()
        .setColor('#09b82c')
        .setTitle(coin.name)
        .addFields([
            { name: 'Current Price', value: `${coin.currentprice}`},
            { name: 'Last Price', value: `${coin.lastprice}`},
            { name: '% Change', value: `${Number((coin.difference).toFixed(3))}%`}
        ])  
        .setTimestamp()
}

function allCoinsEmbed() {

    let fields = []

    fields.push({
        name: `Coin Current-Price Limit`,
        value: '\u200b'
    })

    for(var i = 0; i < coinObjects.length; i++) {

        var coin = coinObjects[i]

        fields.push({
            name: `${coin.name} ${coin.currentprice} ${coin.limit}`,
            value: '\u200b'
        })

    }

    if(coinObjects.length === 0) {
        return new Discord.MessageEmbed()
        .setColor('#c40404')
        .setTitle('Coin List')
        .addField('There are currently no Cryptocurrencies being watched', '\u200b')
        .setTimestamp()
    }

    return new Discord.MessageEmbed()
        .setColor('#09b82c')
        .setTitle('Coin List')
        .addFields(fields)
        .setTimestamp()

}

/**
 * Check the price of all coins in the list
 */
async function checkAllPrice() {

    if(coinObjects.length === 0) return console.log("No coins to test")

    for(var i = 0; i < coinObjects.length; i++) {

        var coin = coinObjects[i]

        let response = await checkPrice(coin.name).catch(err => console.log(err))

        coin.lastprice = coin.currentprice
        coin.currentprice = response
        coin.difference = ((coin.currentprice - coin.lastprice) / coin.currentprice) * 100

        if(coin.difference >= coin.limit) {
            bot.channels.cache.get('730799009244905512').send('@everyone')
            bot.channels.cache.get('730799009244905512').send(priceCheckEmbed(coin))
        }

    }

}

/**
 * Check the price of a single coin: ex) bitcoin, ethereum, etc
 * @param {String} coin 
 */
function checkPrice(coin) {

    return new Promise(function (resolve, reject) {
        request.get({
            url: `https://web-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?aux=num_market_pairs,cmc_rank,date_added,tags,platform,max_supply,circulating_supply,total_supply,market_cap_by_total_supply,volume_24h_reported,volume_7d,volume_30d,volume_30d_reported&convert_id=2781,1,PLATFORM_ID&slug=${coin}`
        }, (error, response, body) => {
            if(error) return reject("[CheckPrice] Error")
    
            let data = body.toString()
            let jsonData = JSON.parse(data)
    
            let key = Object.keys(jsonData.data)
    
            if(key === null || typeof key === 'undefined') {
                reject('null or undefined')
            }

            let quoteKey = Object.keys(jsonData.data[key].quote)

            let price = jsonData.data[key].quote[quoteKey[1]].price
            
            return resolve(price)
        })
    })

}

/**
 * Get coin object by name
 * @param {String} name 
 */
function getCoinObjectByName(name) {
  
    for(var i = 0; i < coinObjects.length; i++) {

        var coin = coinObjects[i]

        if(coin.name.toLowerCase() === name.toLowerCase()) {
            return {
                coin: coin,
                index: i
            }
        }
    }

    return null
}

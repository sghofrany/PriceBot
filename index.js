require('dotenv').config()

const Discord = require('discord.js');
const bot = new Discord.Client();

const request = require('request')
const jsonfile = require('jsonfile')
const path = require('path');
const { captureRejectionSymbol } = require('events');

const TOKEN = process.env.TOKEN;

let coinObjects = []
let timer = 60

bot.login(TOKEN);

bot.on('ready', function() {

    loadCoins()

    bot.user.setUsername("PriceBot")
})

bot.on('message', async function(message) {

    if(message.content.startsWith('!check') || message.content.startsWith('!price') || message.content.startsWith('!p')) {

        let args = message.content.split(' ')

        if(args.length < 2) return message.channel.send(`${message.author} Not enough arguments, !check,!price,!p <coin-name>`)

        let coin = getCoinObjectByName(args[1])

        if(coin === null) return message.channel.send(`${message.author} couldn't find that coin in the watchlist, if you want to add a new coin do !add <coin-name>`)

        coin = coin.coin

        let response = await checkPrice(args[1]).catch(err => console.log(err))

        message.channel.send(priceCheckEmbed(coin, response))

  
    }

    if(message.content.startsWith('!add')) {
    
        let args = message.content.split(' ')

        if(args.length < 2) return message.channel.send(`${message.author} Not enough arguments, !add <coin-name>`)

        if(getCoinObjectByName(args[1]) !== null) return message.channel.send(`${message.author} That coin is already on the watchlist`)

        coinObjects.push({
            name: args[1],
            limit: 0
        })

        jsonfile.writeFile(path.join(__dirname, 'coinlist.json'), {"coins": coinObjects}, function(err) {
            if(err) return console.log("Error while writing to json file")
        })

    }

    if(message.content.startsWith('!remove') || message.content.startsWith('!r')) {
    
        let args = message.content.split(' ')

        if(args.length < 2) return message.channel.send(`${message.author} Not enough arguments, !remove,!r <coin-name>`)

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
                    limit: obj.coins[i].limit
                })
            }
        }

        run()

        checkAllPrice()

        console.log(`Loaded in ${obj.coins.length} coins.`)

    })
}

function priceCheckEmbed(coin, response) {
    return new Discord.MessageEmbed()
        .setColor('#09b82c')
        .setTitle(`${coin.name}`)
        .addFields([
            { name: 'Price', value: `${response.price}`},
            { name: '1hr', value: `${response.per_1h}% ${getPriceEmoji(response.per_1h)}`},
            { name: '24hr', value: `${response.per_24h}% ${getPriceEmoji(response.per_24h)}`},
            { name: '7d', value: `${response.per_7d}% ${getPriceEmoji(response.per_7d)}`},
            { name: '7d volume', value: `${moneyFormat(response.volume_7d)}`}
        ])  
        .setTimestamp()
}

function moneyFormat(price) {
    var formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      });
      
      return formatter.format(price);
}

function getPriceEmoji(price) {

    if(price <= -10) {
        return ":face_vomiting:"
    } else if(price > -10 && price <= -5) {
        return ":face_with_hand_over_mouth:"
    } else if(price > -5 && price <= 0) {
        return ":slight_frown:"
    } else if(price > 0 && price <= 5) {
        return ":smiley:"
    } else if(price > 5 && price <= 10) {
        return ":money_mouth:"
    }  else if(price > 10) {
        return ":moneybag:"
    }

}

function allCoinsEmbed() {

    let fields = []

    fields.push({
        name: `Coin | Limit`,
        value: '\u200b'
    })

    for(var i = 0; i < coinObjects.length; i++) {

        var coin = coinObjects[i]

        fields.push({
            name: `${coin.name} | ${coin.limit}`,
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

        console.log(`${coin.name} 1hr:${response.per_1h} 24hr:${response.per_24h} 7d:${response.per_7d} 7d_volume:${response.volume_7d}`)

        if( response.per_1h >= coin.limit ) {
            bot.channels.cache.get('731175016468840450').send("@everyone")
            bot.channels.cache.get('731175016468840450').send(priceCheckEmbed(coin, response))
        }

    }

    console.log(`[PriceChecker] Checking all ${coinObjects.length} prices.`)

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

            let per_1h = jsonData.data[key].quote[quoteKey[1]].percent_change_1h
            let per_24h = jsonData.data[key].quote[quoteKey[1]].percent_change_24h
            let per_7d = jsonData.data[key].quote[quoteKey[1]].percent_change_7d

            let volume_7d = jsonData.data[key].quote[quoteKey[1]].volume_7d


            return resolve({price: price, per_1h: per_1h, per_24h: per_24h, per_7d: per_7d, volume_7d: volume_7d})
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

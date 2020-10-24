
/**
 * Use this file to define custom functions and blocks.
 * Read more at https://makecode.microbit.org/blocks/custom
 */

/**
 * Custom blocks
 */
//% weight=100 color=#0fbc11 icon=""
namespace IoT_gateway {
    //////////////////
    // Start IoT_gateway
    //////////////////
    let showDebug = true
    let doTelemetry = true
    let doGatewayOrchestrator = false
    //onStart()
    //debug("onStart() > time", control.millis())
    const init_telemetry = "{\"topic\":\"telemetry\"}"
    const init_property = "{\"topic\":\"property\"}"
    const init_log = "{\"topic\":\"device_log\"}"
    let cmd = ""
    let temp1: string[] = []
    let temp0: string[] = []
    let serialRead = ""
    let index = 0
    let sn = 0
    let id = 0
    let packet_loss = 0
    let device_telemetry: string[] = []
    let device_property: string[] = []
    let device_log: string[] = []
    let device_registrar: number[] = []
    let timerRadioRequest = 0
    let timerGatewayRequest = 0
    let microbit_ID = 0
    let delay = 20
    let activeRadioRequest = false
    radio.setTransmitPower(7)
    radio.setGroup(101)
    radio.setTransmitSerialNumber(false)
    microbit_ID = 0
    //add this gateway microbit a index  0
    addMicrobit(control.deviceSerialNumber())

    //% block="set debugger $on"
    //% on.shadow="toggleOnOff"
    export function enableDebug(on: boolean) {
        showDebug = on;
    }

    //%block="telemetry $b"
    //% b.shadow="toggleOnOff"
    export function sendTelemetry(b: boolean) {
        doTelemetry = b
    }

    //% block
    export function runGatewayOrchestrator (): void {
        doGatewayOrchestrator = true
        if (doGatewayOrchestrator) {
            //debug("start orchestration ...")
            //debug("activeRadioRequest = " + activeRadioRequest)
            if (activeRadioRequest) {
                if (input.runningTime() > timerRadioRequest) {
                    //packet loss detected
                    packet_loss += 1
                    debug("packet_loss", packet_loss)
                    request_next_mb()
                } else {
                    //processing incoming radio data in other treat
                    //debug("processing incoming radio data")
                } 
            }
            if (!(activeRadioRequest)) {
            //start new request
            //debug("start new request")
            request_next_mb()
            }
        }
    }
  
    function request_next_mb () {
        microbit_ID = (microbit_ID + 1) % device_registrar.length
        debug("request next microbit",microbit_ID)
        if (device_telemetry[microbit_ID] != null) {
            if (microbit_ID == 0) {
                debug("request data from gateway")
                setTimerGatewayRequest()
                send_gateway_telemetry()
            } else {
                // ?? dit gebeurt blijkbaar voordat new mb geregisteerd is ?
                debug("request data from remote IoT microbit")
                debug("send token", device_registrar[microbit_ID])
                setTimerRadioRequest()
                activeRadioRequest = true
                radio.sendValue("token", device_registrar[microbit_ID])
            }
        } else {
            debug("exception > device_telemetry["+microbit_ID+"] = null")
        }
    }

    function send_gateway_telemetry() {
        if (doTelemetry) {
            debug("send gateway telemetry data")
            let sn=control.deviceSerialNumber()
            telemetry(sn,"id", 0)
            telemetry(sn,"sn", sn)

            telemetry(sn,"time", input.runningTime())
            telemetry(sn,"packetLoss", packet_loss)
            telemetry(sn,"signal", 100)
            telemetry(sn,"temp", input.temperature())
            telemetry(sn,"lightLevel", input.lightLevel())

            telemetry(sn,"accelerometerX", input.acceleration(Dimension.X))
            telemetry(sn,"accelerometerY", input.acceleration(Dimension.Y))
            telemetry(sn,"accelerometerZ", input.acceleration(Dimension.Z))
            
            telemetry(sn,"compass", 1)
            telemetry(sn,"digitalPinP0", pins.digitalReadPin(DigitalPin.P0))
            telemetry(sn,"digitalPinP1", pins.digitalReadPin(DigitalPin.P1))
            telemetry(sn,"digitalPinP2", pins.digitalReadPin(DigitalPin.P2))
            telemetry(sn,"analogPinP0", pins.analogReadPin(AnalogPin.P0))
            telemetry(sn,"analogPinP1", pins.analogReadPin(AnalogPin.P1))
            telemetry(sn,"analogPinP2", pins.analogReadPin(AnalogPin.P2))
            
            //property(sn, "prop1", 1)
            telemetry(sn,"eom", 1)
            //property(sn,"eom", 1)
        }
    }

    function next_gateway () {
        debug("check on next gateway request ...")
        if (input.runningTime() > timerGatewayRequest) {
            debug("request data from gateway")
            setTimerGatewayRequest()
            send_gateway_telemetry()
        }
    }

    function delMicrobit (sn: number) {
        //TODO - continue here ...
        debug("delMicrobit() > sn", sn)
        id = device_registrar.indexOf(sn)
        debug("delMicrobit() > id", id)
        if (id >= 0) {
            if (device_telemetry[id] != null) { // veranderen in functie die zegt of device active is
                device_telemetry[id] = null
                radio.sendString("setId(-1," + sn + ")")
                debug("delMicrobit > radio.sendString > setId(-1,sn)", sn)
            }
        }
    }

    function debug(s: string, v?: number) {
        if (showDebug) {
            const topic = "{\"topic\":\"debug\","
            const t1 = ""+ "\"debug\": \"" + s
            let v1=""
            if (v != null) {
                v1 = " = " + v + "\"}"
            } else {
                v1 = "\"}"
            }
            serial.writeLine(topic + t1 + v1)
            basic.pause(20)
        }
    }

    input.onButtonPressed(Button.B, function () {
        showDebug = !(showDebug)
        if (showDebug) {
            basic.showString("D")
        } else {
            basic.showString("")
        }
    })

    function addMicrobit (sn: number) {
        id = device_registrar.indexOf(sn)
        debug("addMicrobit("+sn+")")
        debug("id",id)
        if (id < 0) {
            debug("id < 0")
            // device does not exist yet, add new device
            device_registrar.push(sn)
            device_telemetry.push(init_telemetry)
            device_property.push(init_property)
            device_log.push(init_log)
            radio.sendString("setId(" + device_registrar.indexOf(sn) + "," + sn + ")")
            debug("setId(" + device_registrar.indexOf(sn) + "," + sn + ")")
            setTimerRadioRequest(1000)
            setTimerGatewayRequest(1000)
            // basic.pause(500)
        } else {
            debug("id >= 0") 
            /*
            // device exists already, device_telemetry=null, reactivate it by setting device_telemetry to "{"
            device_telemetry[id] = init_telemetry
            debug("init_telemetry["+id+"] = "+device_telemetry[id] )
            debug("setId(" + device_registrar.indexOf(sn) + "," + sn + ")")
            radio.sendString("setId(" + device_registrar.indexOf(sn) + "," + sn + ")")
            debug("setId(" + device_registrar.indexOf(sn) + "," + sn + ")")
            setTimerRadioRequest(1000)
            basic.pause(500)
            */
        }
    }

    radio.onReceivedValue(function (name, value) {
        if (doGatewayOrchestrator) {
            //debug("radio.onReceivedValue(" + name + "," + value + ")")
            setTimerRadioRequest() // waarom is dit nog nodig ?
            sn = radio.receivedPacket(RadioPacketProperty.SerialNumber)
            //debug("radio.onReceivedValue() > sn",sn)
            if((name=="register") || (name=="del")) {
                if (name == "register") {
                        addMicrobit(sn)
                } else if (name == "del") {
                        delMicrobit(sn)
                }
            } else {
                index = device_registrar.indexOf(sn)
                //  debug("radio.onReceivedValue() > index",index)
                led.plot(index, 3)
                if (name == "id") {
                    telemetry(sn, "id", value)
                } else if (name == "sn") {
                    telemetry(sn, "sn", sn) //waarom abs ?
                } else if (name == "time") {
                    telemetry(sn, "time", radio.receivedPacket(RadioPacketProperty.Time))
                } else if (name == "packet") {
                    telemetry(sn, "packetLoss", packet_loss)
                } else if (name == "signal") {
                    telemetry(sn, "signalStrength", radio.receivedPacket(RadioPacketProperty.SignalStrength))
                } else if (name == "light") {
                    telemetry(sn, "lightLevel", value)
                } else if (name == "accX") {
                    telemetry(sn, "accelerometerX", value)
                } else if (name == "accY") {
                    telemetry(sn, "accelerometerY", value)
                } else if (name == "accZ") {
                    telemetry(sn, "accelerometerZ", value)
                } else if (name == "comp") {
                    telemetry(sn, "compass", value)
                } else if (name == "dP0") {
                    telemetry(sn, "digitalPinP0", value)
                } else if (name == "dP1") {
                    telemetry(sn, "digitalPinP1", value)
                } else if (name == "dP2") {
                    telemetry(sn, "digitalPinP2", value)
                } else if (name == "aP0") {
                    telemetry(sn, "analogPinP0", value)
                } else if (name == "aP1") {
                    telemetry(sn, "analogPinP1", value)
                } else if (name == "aP2") {
                    telemetry(sn, "analogPinP2", value)
                } else if (name == "temp") {
                    telemetry(sn, "temperature", value)
                } else if (name == "eom") {
                    telemetry(sn, "eom", value)
                    property(sn, "eom", value)
                    log(sn, "eom", value)
                    activeRadioRequest = false
                } else if (name.substr(0, 2) == "d:") {
                    // debug/log data
                    log(sn, name.substr(2,name.length), value)
                } else {
                    // property data
                    property(sn, name, value)
                }
                led.unplot(index, 3)
            }
        }
    })

    function property (sn: number, text: string, num: number) {
        microbit_ID = device_registrar.indexOf(sn)
        debug("ID="+microbit_ID+" sn="+sn+" property("+text+","+num+")")
        let JSON = device_property[microbit_ID]
        if (JSON.includes("}")) {
            JSON = JSON.substr(0, JSON.length - 1)
            JSON = "" + JSON + ","
        }
        if (true) {
            JSON = "" + JSON + "\"" + text + "\"" + ":" + num + "}"
        } else {
            debug("skipped: " + text + ":" + num)
        }
        if (JSON.includes("eom")) {
            debug("eom property")
            led.plot(device_registrar.indexOf(sn), 4)
            serial.writeLine(JSON)
            basic.pause(delay)
            led.unplot(device_registrar.indexOf(sn), 4)
            JSON = init_property
        } 
        device_property[microbit_ID] = JSON
    }

    function log (sn: number, text: string, num: number) {
        microbit_ID = device_registrar.indexOf(sn)
        debug("ID="+microbit_ID+" sn="+sn+" log("+text+","+num+")")
        let JSON = device_log[microbit_ID]
        if (JSON.includes("}")) {
            JSON = JSON.substr(0, JSON.length - 1)
            JSON = "" + JSON + ","
        }
        if (true) {
            JSON = "" + JSON + "\"" + text + "\"" + ":" + num + "}"
        } else {
            debug("skipped: " + text + ":" + num)
        }
        if (JSON.includes("eom")) {
            debug("eom log")
            led.plot(device_registrar.indexOf(sn), 4)
            serial.writeLine(JSON)
            basic.pause(delay)
            led.unplot(device_registrar.indexOf(sn), 4)
            JSON = init_log
        }
        device_log[microbit_ID] = JSON
    }

    function telemetry (sn: number, text: string, num: number) {
        //microbit_ID = device_registrar.indexOf(sn)
        //debug("ID="+microbit_ID+" telemetry("+text+","+num+")")
        let JSON=""
        JSON = device_telemetry[microbit_ID]
        if (JSON.includes("}")) {
            JSON = JSON.substr(0, JSON.length - 1)
            JSON = "" + JSON + ","
        }
        if (JSON.includes("id") || text == "id") {
            JSON = "" + JSON + "\"" + text + "\"" + ":" + num + "}"
        } else {
            debug("skipped: " + text + ":" + num)
        }
        if (JSON.includes("eom")) {
            //debug("eom telemetry")
            led.plot(device_registrar.indexOf(sn), 4)
            serial.writeLine(JSON)
            basic.pause(delay)
            led.unplot(device_registrar.indexOf(sn), 4)
            JSON = init_telemetry
        }
        device_telemetry[microbit_ID] = JSON
    }

    serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
        if (doGatewayOrchestrator) {
            serialRead = serial.readUntil(serial.delimiters(Delimiters.NewLine))
            debug("serial.onDataReceived() > serialRead ="+ serialRead)
            if (!(serialRead.isEmpty())) {
                temp0 = serialRead.split(":")
                if (temp0.length == 1) {
                    radio.sendString(serialRead)
                    debug("serial.onDataReceived() > radio.sendString("+ serialRead+")")
                }
                if (temp0.length == 2) {
                    temp1 = temp0[0].split(",")
                    for (let i = 0; i <= temp1.length - 1; i++) {
                        cmd = "" + temp1[i] + ":" + temp0[1]
                        radio.sendString(cmd)
                        debug("serial.onDataReceived() > radio.sendString("+cmd+")")
                        basic.pause(20)
                    }
                }
            }
        }
    })

    function setTimerRadioRequest (t?:number) {
        const v = t || 400
        timerRadioRequest = input.runningTime() + v
        //debug("resetTimerRadioRequest", timerRadioRequest)
    }

    function setTimerGatewayRequest (t?:number) {
        const v = t || 250
        timerGatewayRequest = input.runningTime() + v
        //debug("resetTimerGatewayRequest",timerGatewayRequest)
    }

    
    ///////////////////
    // End IoT Gateway
    ///////////////////

    ///////////////////
    // Start IoT Client
    ///////////////////
 //   let temp0: string[] = []
    let str = ""
    let reportedproperties = ""
    let p3 = ""
    let p2 = ""
    let p1 = ""
 //   let cmd = ""
    let temp3: string[] = []
    let temp2: string[] = []
//    let temp1: string[] = []
    let iconnumber = 0
//    let delay = 0
    let doCommands = false
//    let serialRead = ""
    let strip: neopixel.Strip = null
    export let identity = 0
    identity = -1
    radio.setGroup(101)
    radio.setTransmitSerialNumber(true)
    radio.setTransmitPower(7)
    strip = neopixel.create(DigitalPin.P1, 10, NeoPixelMode.RGB)
    strip.clear()
    strip.show()
    serialRead = ""
    doCommands = false
    delay = 10

    function cloud2device () {
        // process cloud commands
        if (!(serialRead.isEmpty())) {
            temp0 = serialRead.split(":")
            if (temp0.length == 1) {
                // received a generic command
                temp1 = serialRead.split("(")
                temp2 = temp1[1].split(")")
                temp3 = temp2[0].split(",")
                cmd = convertToText(temp1[0])
                p1 = temp3[0]
                p2 = temp3[1]
                p3 = temp3[2]
                serialRead = ""
                basic.showString("" + (p1))
                invokeCommands()
            }
            if (temp0.length == 2) {
                if (parseFloat(temp0[0]) == identity) {
                    // received a specific command for this device
                    temp1 = temp0[1].split("(")
                    temp2 = temp1[1].split(")")
                    temp3 = temp2[0].split(",")
                    cmd = convertToText(temp1[0])
                    p1 = temp3[0]
                    p2 = temp3[1]
                    p3 = temp3[2]
                    serialRead = ""
                    invokeCommands()
                }
            }
        }
    }

 
    function invokeCommands () {
        if (doCommands) {
            if (cmd == "setId") {
                setIdentity(parseFloat(p1), parseFloat(p2))
            }
            if (cmd == "who") {
                who()
            }
            if (cmd == "clear") {
                clear()
            }
            if (cmd == "rgb") {
                setRGB(parseFloat(p1), parseFloat(p2), parseFloat(p3))
            }
            if (cmd == "color") {
                setColor(p1)
            }
            if (cmd == "icon") {
                setIcon(p1)
            }
            if (cmd == "reset") {
                setReset()
            }
            if (cmd == "brightness") {
                setBrightness(parseFloat(p1))
            }
            if (cmd == "servo") {
                servo(parseFloat(p1))
            }
            if (cmd == "digitalWrite") {
                setDigitalPin(parseFloat(p1), parseFloat(p2))
            }
            if (cmd == "analogWrite") {
                SetAnalogPin(parseFloat(p1), parseFloat(p2))
            }
            reportedproperties = "add here"
            doCommands = false
        }
    }

   
    /////////////////
    // End IoT Client
    /////////////////


    /////////////////////
    // Start IoT Commands
    /////////////////////

     function SetAnalogPin (pin: number, value: number) {
        basic.showString("a")
        if (pin == 0) {
            pins.analogWritePin(AnalogPin.P0, value)
        }
        if (pin == 1) {
            pins.analogWritePin(AnalogPin.P1, value)
        }
        if (pin == 2) {
            pins.analogWritePin(AnalogPin.P2, value)
        }
    }

    function setReset () {
        basic.showString("reset")
        control.reset()
    }

   function setIcon (name: string) {
        // show icon
        if (name == "heart") {
            basic.showIcon(IconNames.Heart)
        } else if (name == "happy") {
            basic.showIcon(IconNames.Happy)
        } else if (name == "cls") {
            basic.clearScreen()
        } else if (name == "sad") {
            basic.showIcon(IconNames.Sad)
        } else if (name == "random") {
            iconnumber = randint(0, 2)
            basic.clearScreen()
            basic.pause(500)
            if (iconnumber == 0) {
                basic.showIcon(IconNames.Chessboard)
            } else if (iconnumber == 1) {
                basic.showIcon(IconNames.Square)
            } else if (iconnumber == 2) {
                basic.showIcon(IconNames.Scissors)
            }
        }
    }

    function servo (value: number) {
        basic.showString("s")
        pins.servoWritePin(AnalogPin.P0, value)
        basic.pause(1000)
        basic.clearScreen()
    }
    function setRGB (r: number, g: number, b: number) {
        basic.showString("r")
        strip.showColor(neopixel.rgb(r, g, b))
        basic.pause(1000)
        basic.clearScreen()
    }
    function setIdentity (i: number, v: number) {
        if (v == control.deviceSerialNumber()) {
            identity = i
            who()
        }
    }

    function setText (text: string) {
        basic.showString(text)
    }

    function clear () {
        basic.clearScreen()
    }

    function setBrightness (value: number) {
        strip.setBrightness(value)
        strip.showRainbow(1, 360)
        strip.show()
    }
    function setDigitalPin (pin: number, value: number) {
        basic.showString("d")
        if (pin == 0) {
            pins.digitalWritePin(DigitalPin.P0, value)
        }
        if (pin == 1) {
            pins.digitalWritePin(DigitalPin.P1, value)
        }
        if (pin == 2) {
            pins.digitalWritePin(DigitalPin.P2, value)
        }
    }

    function who () {
        basic.showNumber(identity)
    }

    function setColor (color: string) {
        basic.showString("c")
        if (color == "red") {
            strip.showColor(neopixel.colors(NeoPixelColors.Red))
        } else if (color == "orange") {
            strip.showColor(neopixel.colors(NeoPixelColors.Orange))
        } else if (color == "yellow") {
            strip.showColor(neopixel.colors(NeoPixelColors.Yellow))
        } else if (color == "green") {
            strip.showColor(neopixel.colors(NeoPixelColors.Green))
        } else if (color == "blue") {
            strip.showColor(neopixel.colors(NeoPixelColors.Blue))
        } else if (color == "indigo") {
            strip.showColor(neopixel.colors(NeoPixelColors.Indigo))
        } else if (color == "violet") {
            strip.showColor(neopixel.colors(NeoPixelColors.Violet))
        } else if (color == "purple") {
            strip.showColor(neopixel.colors(NeoPixelColors.Purple))
        } else if (color == "white") {
            strip.showColor(neopixel.colors(NeoPixelColors.White))
        } else if (color == "black") {
            strip.showColor(neopixel.colors(NeoPixelColors.Black))
        } else if (color == "clear") {
            strip.clear()
        } else if (color == "rainbow") {
            strip.showRainbow(1, 360)
        }
        strip.show()
        reportedproperties = "\"" + color + "\""
    }

    /////////////////////
    // End IoT Commands
    /////////////////////
}
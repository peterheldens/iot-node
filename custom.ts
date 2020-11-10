/**
 * Author: Peter Heldens, 25- okt 2020
 * 
 * NodeRed Extension to experiment with:
 * - Azure IoT Digital Twins
 * - Telemetry, Cloud2Device (C2D), Device2Cloud (D2C)
 * - NodeRed & Dashboards
 * 
 * It supports multiple microbits Leaf Nodes (EndPoints) and one (1) microbit Gateway.
 * - Leaf Nodes use Radio to communicate with the Gateway.
 * - Gateway Node use Serial communication to a serial device (Node-Red server).
 * - Leaf Nodes respond to Gateway (after Gateway initiated a HandShake).
 * 
 * Leaf Nodes respond to Gateway by:
 * - sending Telemetry, Properties, Commands to the Gateway
 * - receiving C2D commands from the Gateway
 * - executing C2D commands targeted to the specific Leaf Node
 *  
 * GateWay Node orchestrates:
 * - radio communication to Leaf Nodes using HandShakes
 * - serial communication to Node-Red server (Any PC/Android/RaspberryPi)
 * 
 *  tips to create blocks:
 *  https://makecode.microbit.org/blocks/custom
 *  https://makecode.com/playground
 * 
 * TODO: 
 * [x] gateway: enable property
 * [x] endpoint: enable telemetry switch for EndPoint
 * [0] endpoint: remove debug
 * [0] gateway: make register/unregister work the same as for the endpoint? or rename to register endpoint
 * [x] gateway: make submit property name = work the same as for Mode.EndPoint
 * [0] change IoT icon to some IoT hub or Radio account
 * [x] enable/disable properties (digital write, analog write, accelerometer,etc.)
 * [0] Azure IoT hub connectivity:
 * [0] sending telemetry to Azure IoT Hub
 * [0] receiving and responding to direct messages coming from Azure
 * [0] receiving and responding to desired properties using the Device Twin
 * [0] updating reported properties in the Device Twin
 * [0] receiving and responding to C2D messages (commands)
 */

enum Mode {
    EndPoint,
    Gateway
}

//% groups="['Gateway','EndPoint','General','Advanced"]"

//% weight=100 color=#0fbc11 icon=""
namespace IoT {
    //////////////////
    // Start IoT_gateway
    //////////////////
    let deviceMode = Mode.Gateway
    let showDebug = true
    let doTelemetry = true

    //init D2C data

    const init_telemetry    = "{\"topic\":\"telemetry\"}"
    const init_property     = "{\"topic\":\"property\"}"
    const init_log          = "{\"topic\":\"device_log\"}"

/* experiment
    const init_telemetry    = "{\"topic\":\"telemetry\", \"payload\":{"
    const init_property     = "{\"topic\":\"property\", \"payload\":{"
    const init_log          = "{\"topic\":\"device_log\", \"payload\":{"
*/
    let device_telemetry    : string[] = []
    let device_property     : string[] = []
    let device_log          : string[] = []

    //init EndPoint array
    let device_registrar: number[] = []

    //init packet_loss
    let packet_loss = 0

    //init timers
    let timerRadioRequest = 0
    let timerGatewayRequest = 0

    let microbit_ID = 0 // this is the index of the EndPoint to be processed using the HandShake
    let delay = 20
    let activeRadioRequest = false

    //init Radio
    radio.setTransmitPower(7)
    radio.setGroup(101)
    radio.setTransmitSerialNumber(true)

    //% block="start IoT node as $mode"
    //% weight=100
    //% group="Gateway"
    export function setDeviceMode(mode: Mode) {
        switch (mode) {
            case Mode.EndPoint: {
                deviceMode=Mode.EndPoint
                //EndPoint device with identity = -1 (unregistered to Gateway)
                identity=-1
                break;
            }
            case Mode.Gateway: {
                deviceMode=Mode.Gateway
                //Gateway device with identity = 0 (register to Gateway)
                identity=0
                addMicrobit(control.deviceSerialNumber())
            }
        }
    }

    //% block="set debug mode $on"
    //% group="Gateway"
    //% weight=10
    //% on.shadow="toggleOnOff"
    export function enableDebug(on: boolean) {
        showDebug = on;
    }

    //%block="telemetry $b"
    //% group="General"
    //% weight=80
    //% b.shadow="toggleOnOff"
    export function sendTelemetry(b: boolean) {
        doTelemetry = b
    }

    //% block
    //% weight=50
    //% group="Gateway"
    export function runGatewayOrchestrator (): void {
        if (deviceMode==Mode.Gateway) {
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
        // request data from the next microbit using handshake & round robin
        if (deviceMode==Mode.Gateway) {
            microbit_ID = (microbit_ID + 1) % device_registrar.length
            debug("request next microbit",microbit_ID)
            if (device_telemetry[microbit_ID] != null) {
                if (microbit_ID == -1) {
                    // The EndPoint not initialised
                    debug("exception > device_telemetry["+microbit_ID+"] = -1")
                }
                if (microbit_ID == 0) {
                    // The EndPoint is the Gateway 
                    debug("request data from gateway")
                    setTimerGatewayRequest()
                    gatewaySubmitTelemetry()
                    gatewaySubmitProperty()
                }
                if (microbit_ID > 0)  {
                    // The EndPoint is one of the radio connected microbits
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
    }

    function gatewaySubmitTelemetry() {
        // gateway to submit telemetry
        if (deviceMode==Mode.Gateway) {
            if (doTelemetry) {
                debug("submit gateway telemetry data")
                let sn=control.deviceSerialNumber()
                gatewaySendTelemetry(sn,"id", 0)
                gatewaySendTelemetry(sn,"sn", sn)

                gatewaySendTelemetry(sn,"time", input.runningTime())
                gatewaySendTelemetry(sn,"packetLoss", packet_loss)
                gatewaySendTelemetry(sn,"signal", 100)
                if (doTemperature) {
                    gatewaySendTelemetry(sn,"temperature", input.temperature())
                }
                if(doLightLevel) {
                    gatewaySendTelemetry(sn,"lightLevel", input.lightLevel())
                }
                if (doAccelerometer) {
                    gatewaySendTelemetry(sn,"accelerometerX", input.acceleration(Dimension.X))
                    gatewaySendTelemetry(sn,"accelerometerY", input.acceleration(Dimension.Y))
                    gatewaySendTelemetry(sn,"accelerometerZ", input.acceleration(Dimension.Z))
                    gatewaySendTelemetry(sn,"accelerometerS", input.acceleration(Dimension.Strength))
                }
                if (doMagneticForce) {
                    gatewaySendTelemetry(sn,"magneticForceX", input.magneticForce(Dimension.X))
                    gatewaySendTelemetry(sn,"magneticForceY", input.magneticForce(Dimension.Y))
                    gatewaySendTelemetry(sn,"magneticForceZ", input.magneticForce(Dimension.Z))
                    gatewaySendTelemetry(sn,"magneticForceS", input.magneticForce(Dimension.Strength))
                }
                if (doRotation) {
                    gatewaySendTelemetry(sn,"rotationPitch", input.rotation(Rotation.Pitch))
                    gatewaySendTelemetry(sn,"rotationRoll", input.rotation(Rotation.Roll))
                }
                if (doCompass) {
                     gatewaySendTelemetry(sn,"compass", 1)
                }
                if (doDigitalRead) {
                    gatewaySendTelemetry(sn,"digitalPinP0", pins.digitalReadPin(DigitalPin.P0))
                    gatewaySendTelemetry(sn,"digitalPinP1", pins.digitalReadPin(DigitalPin.P1))
                    gatewaySendTelemetry(sn,"digitalPinP2", pins.digitalReadPin(DigitalPin.P2))
                }
                if (doAnalogRead) {
                    gatewaySendTelemetry(sn,"analogPinP0", pins.analogReadPin(AnalogPin.P0))
                    gatewaySendTelemetry(sn,"analogPinP1", pins.analogReadPin(AnalogPin.P1))
                    gatewaySendTelemetry(sn,"analogPinP2", pins.analogReadPin(AnalogPin.P2))
                }
                gatewaySendTelemetry(sn,"eom", 1)
            }
        }
    }

    function gatewaySubmitProperty () {
        // gateway to submit property
        // send device property value pairs to the cloud
        // value pair: (name, value) = (propSting, propValue)
        if (deviceMode==Mode.Gateway) { 
            if ((doProperty) && (propString.length > 0)) {
                const sn = control.deviceSerialNumber()
                gatewaySendProperty(sn,"id", microbit_ID)
                for (let i=0; i<propString.length;i++) {
                    const s=propString[i]
                    const v=propValue[i]
                    gatewaySendProperty(sn,s, v)
                }   
                gatewaySendProperty(sn,"eom", 1)
            }
        }
    }

       function gatewaySubmitPropertyOld () {
        // gateway to submit property
        // send device property value pairs to the cloud
        // value pair: (name, value) = (propSting, propValue)
        if (deviceMode==Mode.Gateway) { 
            if ((doProperty) && (propString.length > 0)) {
                const sn = control.deviceSerialNumber()
                gatewaySendProperty(sn,"id", microbit_ID)
                while (propString.length > 0) {
                    const s=propString.pop()
                    const v=propValue.pop()
                    gatewaySendProperty(sn,s, v)
                }   
                gatewaySendProperty(sn,"eom", 1)
            }
        }
    }


    function delMicrobit (sn: number) {
        if (deviceMode==Mode.Gateway) {
            //TODO - continue here ...
            debug("delMicrobit() > sn", sn)
            const id = device_registrar.indexOf(sn)
            debug("delMicrobit() > id", id)
            if (id >= 0) {
                if (device_telemetry[id] != null) { // TODO:veranderen in functie die zegt of device active is
                    device_telemetry[id] = null
                    radio.sendString("setId(-1," + sn + ")")
                    debug("delMicrobit > radio.sendString > setId(-1,sn)", sn)
                }
            }
        }
    }

    function debug(s: string, v?: number) {
        // send Gateway debug info as JSON string from to ComPort
        if (deviceMode==Mode.Gateway) {
            if (showDebug) {
                const topic = "{\"topic\":\"debug\","
                //const topic = "{\"topic\":\"debug\",\"payload\":{"+s+"="+v+"}}"
                const t1 = ""+ "\"debug\": \"" + s
                let v1=""
                if (v != null) {
                    v1 = " = " + v + "\"}"
                } else {
                    v1 = "\"}"
                }
                serial.writeLine(topic + t1 + v1)
                //serial.writeLine(topic)
                basic.pause(20)
            }
        }
    }

    function addMicrobit (sn: number) {
        // add EndPoint device to the device registrar
        if (deviceMode==Mode.Gateway) {
            const id = device_registrar.indexOf(sn)
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
    }

    radio.onReceivedValue(function (name, value) {
        if (deviceMode==Mode.Gateway) {
            debug("radio.onReceivedValue(" + name + "," + value + ")")
            setTimerRadioRequest() // waarom is dit nog nodig ?
            const sn = radio.receivedPacket(RadioPacketProperty.SerialNumber)
            debug("radio.onReceivedValue() > sn",sn)
            if((name=="register") || (name=="del")) {
                if (name == "register") {
                        addMicrobit(sn)
                } else if (name == "del") {
                        delMicrobit(sn)
                }
            } else {
                const id = device_registrar.indexOf(sn)
                debug("radio.onReceivedValue() > id",id)
                led.plot(id, 3)
                if (name == "id") {
                    gatewaySendTelemetry(sn, "id", value)
                } else if (name == "sn") {
                    gatewaySendTelemetry(sn, "sn", sn) //waarom abs ?
                } else if (name == "time") {
                    gatewaySendTelemetry(sn, "time", radio.receivedPacket(RadioPacketProperty.Time))
                } else if (name == "packet") {
                    gatewaySendTelemetry(sn, "packetLoss", packet_loss)
                } else if (name == "signal") {
                    gatewaySendTelemetry(sn, "signalStrength", radio.receivedPacket(RadioPacketProperty.SignalStrength))
                } else if (name == "light") {
                    gatewaySendTelemetry(sn, "lightLevel", value)
                } else if (name == "accX") {
                    gatewaySendTelemetry(sn, "accelerometerX", value)
                } else if (name == "accY") {
                    gatewaySendTelemetry(sn, "accelerometerY", value)
                } else if (name == "accZ") {
                    gatewaySendTelemetry(sn, "accelerometerZ", value)
                } else if (name == "accS") {
                    gatewaySendTelemetry(sn, "accelerometerS", value)
                } else if (name == "magX") {
                    gatewaySendTelemetry(sn, "magneticForceX", value)
                } else if (name == "magY") {
                    gatewaySendTelemetry(sn, "magneticForceY", value)
                } else if (name == "magZ") {
                    gatewaySendTelemetry(sn, "magneticForceZ", value)
                } else if (name == "magS") {
                    gatewaySendTelemetry(sn, "magneticForceS", value)
                } else if (name == "rotP") {
                    gatewaySendTelemetry(sn, "rotationPitch", value)
                } else if (name == "rotR") {
                    gatewaySendTelemetry(sn, "rotationRoll", value)
                } else if (name == "comp") {
                    gatewaySendTelemetry(sn, "compass", value)
                } else if (name == "dP0") {
                    gatewaySendTelemetry(sn, "digitalPinP0", value)
                } else if (name == "dP1") {
                    gatewaySendTelemetry(sn, "digitalPinP1", value)
                } else if (name == "dP2") {
                    gatewaySendTelemetry(sn, "digitalPinP2", value)
                } else if (name == "aP0") {
                    gatewaySendTelemetry(sn, "analogPinP0", value)
                } else if (name == "aP1") {
                    gatewaySendTelemetry(sn, "analogPinP1", value)
                } else if (name == "aP2") {
                    gatewaySendTelemetry(sn, "analogPinP2", value)
                } else if (name == "temp") {
                    gatewaySendTelemetry(sn, "temperature", value)
                } else if (name == "eom") {
                    gatewaySendTelemetry(sn, "eom", value)
                    //gatewaySendProperty(sn, "eom", value) // TODO: klopt dit wel?
                    //gatewaySendLog(sn, "eom", value)
                    activeRadioRequest = false
                } else if (name.substr(0, 2) == "d:") {
                    // debug/log data
                    //gatewaySendLog(sn, name.substr(2,name.length), value)
                } else {
                    // property data
                    gatewaySendProperty(sn, name, value)
                }
                led.unplot(id, 3)
            }
        }
        //incoming Handshake request from Gateway to deliver D2C Telemetry, etc.
        if (deviceMode==Mode.EndPoint) {
            if (identity >= 0) {
                if (name == "token" && value == control.deviceSerialNumber()) {
                    leafSendTelemetry()
                    leafSendProperty()
                    //leafSendDebug()
                    leafSendEndOfMessage()
                }
            }
        }
    })

    function gatewaySendProperty (sn: number, text: string, num: number) {
        // assemble data object and send as JSON String to ComPort
        if (deviceMode==Mode.Gateway) {
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
                serial.writeLine("")
                basic.pause(delay)
                led.unplot(device_registrar.indexOf(sn), 4)
                JSON = init_property
            } 
            device_property[microbit_ID] = JSON
        }
    }

    function gatewaySendLog (sn: number, text: string, num: number) {
        // assemble data object and send as JSON String to ComPort
        if (deviceMode==Mode.Gateway) {
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
                serial.writeLine("")
                basic.pause(delay)
                led.unplot(device_registrar.indexOf(sn), 4)
                JSON = init_log
            }
            device_log[microbit_ID] = JSON
        }
    }

        function gatewaySendTelemetryExperiment (sn: number, text: string, num: number) {
        // assemble data object and send as JSON String to ComPort
        if (deviceMode==Mode.Gateway) {
            //microbit_ID = device_registrar.indexOf(sn)
            //debug("ID="+microbit_ID+" telemetry("+text+","+num+")")
            let JSON=""
            JSON = device_telemetry[microbit_ID]
            /*
            if (JSON.includes("}")) {
                JSON = JSON.substr(0, JSON.length - 1)
                JSON = "" + JSON + ","
            }
            */
            if (JSON.includes("id") || text == "id") {
                JSON = "" + JSON + "\"" + text + "\"" + ":" + num + ","
            } else {
                debug("skipped: " + text + ":" + num)
            }
            if (JSON.includes("eom")) {
                JSON = JSON.substr(0, JSON.length - 9) // 9=length of ,"eom":1,
                JSON = "" + JSON + "}}"
                //debug("eom telemetry")
                led.plot(device_registrar.indexOf(sn), 4)
                serial.writeLine(JSON)
                basic.pause(delay)
                serial.writeLine("")
                basic.pause(delay)
                led.unplot(device_registrar.indexOf(sn), 4)
                JSON = init_telemetry
            }
            device_telemetry[microbit_ID] = JSON
        }
    }

    function gatewaySendTelemetry (sn: number, text: string, num: number) {
        // assemble data object and send as JSON String to ComPort
        if (deviceMode==Mode.Gateway) {
            microbit_ID = device_registrar.indexOf(sn)
            debug("ID="+microbit_ID+" telemetry("+text+","+num+")")
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
                serial.writeLine("")
                basic.pause(delay)
                led.unplot(device_registrar.indexOf(sn), 4)
                JSON = init_telemetry
            }
            device_telemetry[microbit_ID] = JSON
        }
    }

    serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
        //receive C2D commands from ComPort
        if (deviceMode==Mode.Gateway) {
            const serialRead = serial.readUntil(serial.delimiters(Delimiters.NewLine))
            debug("serial.onDataReceived() > serialRead ="+ serialRead)
            if (!(serialRead.isEmpty())) {
                const t0 = serialRead.split(":")
                // C2D command is generic to all EndPoint devices
                if (t0.length == 1) {
                    processC2D(serialRead) //TODO: alleen als doCommands=true?
                    radio.sendString(serialRead)
                    debug("serial.onDataReceived() > radio.sendString("+ serialRead+")")
                }
                if (t0.length == 2) {
                // C2D command is for specific named EndPoint devices (n; 0<n<N)
                    const t1 = t0[0].split(",")
                    for (let i = 0; i <= t1.length - 1; i++) {
                        // convert EndPoint devices N:1 
                        const cmd = "" + t1[i] + ":" + t0[1]
                        processC2D(cmd) //TODO: alleen als doCommands=true?
                        radio.sendString(cmd)
                        debug("serial.onDataReceived() > radio.sendString("+cmd+")")
                        basic.pause(20)
                    }
                }
            }
        }
    })

    function setTimerRadioRequest (t?:number) {
        if (deviceMode==Mode.Gateway) {
            const v = t || 400
            timerRadioRequest = input.runningTime() + v
            //debug("resetTimerRadioRequest", timerRadioRequest)
        }
    }

    function setTimerGatewayRequest (t?:number) {
        if (deviceMode==Mode.Gateway) {
            const v = t || 250
            timerGatewayRequest = input.runningTime() + v
            //debug("resetTimerGatewayRequest",timerGatewayRequest)
        }
    }

    
    ///////////////////
    // End IoT Gateway
    ///////////////////


    ///////////////////
    // Start IoT Client
    ///////////////////
    let radioGroup = 101
    export let identity = -1
    let doProperty = true
    let doD2C = true
    let doDebug = true
    let propString: string[] = []
    let propValue: number[] = []
    let doAccelerometer = true
    let doMagneticForce = true
    let doRotation = true
    let doDigitalRead = false
    let doAnalogRead = false
    let doCompass = false
    let doTemperature = true
    let doLightLevel = true

    //%block="submit property | name = $p | value = $v"
    //% weight=100
    //% group="General"
    export function addProperty(p: string, v:number) {
        // add digital twin reported.property
        // add (name, value) pair to array of (propSting, propValue)
        const index = propString.indexOf(p)
        if ( index < 0) {
            // we have a new value pair
            propString.push(p)
            propValue.push(v)
        } else {
            // we have an existing value pair, don't add this one...
            // current implementation overwrites existing value pair 
            // the following 2 statements might be deleted (as it is overwrite existing strip.show())
            propString[index] = p
            propValue[index] = v
        }    
    }

    function leafSendProperty () {
        // send device property value pairs to the cloud
        // value pair: (name, value) = (propSting, propValue)
        if (deviceMode==Mode.EndPoint) { 
            if (doProperty) {
                for (let i=0; i<propString.length;i++) {
                    const s=propString[i]
                    const v=propValue[i]
                    radio.sendValue(s, v)
                    basic.pause(delay)
                }   
            }
        }
    }

        function leafSendPropertyOld () {
        // send device property value pairs to the cloud
        // value pair: (name, value) = (propSting, propValue)
        if (deviceMode==Mode.EndPoint) { 
            if (doProperty) {
                while (propString.length > 0) {
                    const s=propString.pop()
                    const v=propValue.pop()
                    radio.sendValue(s, v)
                    basic.pause(delay)
                }   
            }
        }
    }


    //%block="property $b"
    //% group="General"
    //% b.shadow="toggleOnOff"
    export function sendProperty(b: boolean) {
        doProperty = b
    }

    //%block="accelerometer $b"
    //% group="Advanced" advanced=true
    //% b.shadow="toggleOnOff"
    export function sendAccelerometer(b: boolean) {
        doAccelerometer = b
    }

    //%block="magnetic force $b"
    //% group="Advanced" advanced=true
    //% b.shadow="toggleOnOff"
    export function sendMagneticForce(b: boolean) {
        doMagneticForce = b
    }

    //%block="rotation $b"
    //% group="Advanced" advanced=true
    //% b.shadow="toggleOnOff"
    export function sendRotation(b: boolean) {
        doRotation = b
    }

    //%block="analog read $b"
    //% group="Advanced" advanced=true
    //% b.shadow="toggleOnOff"
    export function sendAnalogRead(b: boolean) {
        doAnalogRead = b
    }

    //%block="digital read $b"
    //% group="Advanced" advanced=true
    //% b.shadow="toggleOnOff"
    export function sendDigitalRead(b: boolean) {
        doDigitalRead = b
    }

     //%block="temperature $b"
    //% group="Advanced" advanced=true
    //% b.shadow="toggleOnOff" default=On
    export function sendTemperature(b: boolean) {
        doTemperature = b
    }

    //%block="light level $b"
    //% group="Advanced" advanced=true
    //% b.shadow="toggleOnOff"
    export function sendLightLevel(b: boolean) {
        doLightLevel = b
    }

    //%block="compass $b"
    //% group="Advanced" advanced=true
    //% b.shadow="toggleOnOff"
    export function sendCompass(b: boolean) {
        doCompass = b
    }

    //% block
    //% weight=100
    //% group="EndPoint"
    export function registerDevice () {
        basic.clearScreen()
        if (identity < 0) {
            while (identity < 0) {
                radio.sendValue("register", control.deviceSerialNumber())
                led.toggle(2, 2)
                basic.pause(200)
            }
        } else {
            basic.showString("already registered")
        }
        basic.clearScreen()
        who()
    }
    //% block
    //% weight=50
    //% group="EndPoint"
    export function unregisterDevice () {
        basic.clearScreen()
        if (identity >= 0) {
            radio.sendValue("del", control.deviceSerialNumber())
            led.toggle(2, 2)
            basic.pause(1000)
        } else {
            basic.showString("already deleted")
        }
    }

    function leafSendTelemetry () {
        // send telemetry from Leave Device to the Gateway Device
        if (deviceMode==Mode.EndPoint) {
            if (doTelemetry) {
                radio.sendValue("id", identity)
                basic.pause(delay)
                radio.sendValue("sn", 0)
                basic.pause(delay)
                radio.sendValue("time", 0)
                basic.pause(delay)
                radio.sendValue("packet", 0)
                basic.pause(delay)
                radio.sendValue("signal", 0)
                basic.pause(delay)
                if (doTemperature) {
                    radio.sendValue("temp", input.temperature())
                    basic.pause(delay)
                }
                if(doLightLevel) {
                    radio.sendValue("light", input.lightLevel())
                    basic.pause(delay)
                }
                if (doAccelerometer) {
                    radio.sendValue("accX", input.acceleration(Dimension.X))
                    basic.pause(delay)
                    radio.sendValue("accY", input.acceleration(Dimension.Y))
                    basic.pause(delay)
                    radio.sendValue("accZ", input.acceleration(Dimension.Z))
                    basic.pause(delay)
                    radio.sendValue("accS", input.acceleration(Dimension.Strength))
                    basic.pause(delay)
                }
                if (doMagneticForce) {
                    radio.sendValue("magX", input.magneticForce(Dimension.X))
                    basic.pause(delay)
                    radio.sendValue("magY", input.magneticForce(Dimension.Y))
                    basic.pause(delay)
                    radio.sendValue("magZ", input.magneticForce(Dimension.Z))
                    basic.pause(delay)
                    radio.sendValue("magS", input.magneticForce(Dimension.Strength))
                    basic.pause(delay)
                }
                if (doCompass) {
                    radio.sendValue("comp", 1)
                    basic.pause(delay)
                }
                if (doDigitalRead) {
                    radio.sendValue("dP0", pins.digitalReadPin(DigitalPin.P0))
                    basic.pause(delay)
                    radio.sendValue("dP1", pins.digitalReadPin(DigitalPin.P1))
                    basic.pause(delay)
                    radio.sendValue("dP2", pins.digitalReadPin(DigitalPin.P2))
                    basic.pause(delay)
                }
                if (doAnalogRead) {
                    radio.sendValue("aP0", pins.analogReadPin(AnalogPin.P0))
                    basic.pause(delay)
                    radio.sendValue("aP1", pins.analogReadPin(AnalogPin.P1))
                    basic.pause(delay)
                    radio.sendValue("aP2", pins.analogReadPin(AnalogPin.P2))
                    basic.pause(delay)
                }
            }
        }    
    }

    function leafSendEndOfMessage () {
        if (deviceMode==Mode.EndPoint) {
            radio.sendValue("eom", 1)
            basic.pause(delay)
        }
    }

    function leafSendDebug () {
        // send debug info to the cloud
        if (deviceMode==Mode.EndPoint) {
            if (doDebug) {
                radio.sendValue("d:id", identity)
                basic.pause(delay)
            }
        }
    }

    radio.onReceivedString(function (receivedString) {
        //incoming request from Gateway with new C2D request
        if (deviceMode==Mode.EndPoint) {
            doCommands = true //TODO: kan dit niet gewoon weg ? Was voor handshake ...
            processC2D(receivedString)
        }
    })

/*
    radio.onReceivedValue(function (name, value) {
        //incoming Handshake request from Gateway to deliver D2C Telemetry, etc.
        if (deviceMode==Mode.EndPoint) {
            if (identity >= 0) {
                if (name == "token" && value == control.deviceSerialNumber()) {
                    leafSendTelemetry()
                    leafSendProperty()
                    //leafSendDebug()
                    leafSendEndOfMessage()
                }
            }
        }
    })
*/

   
    /////////////////
    // End IoT Client
    /////////////////


    /////////////////////
    // Start IoT Commands
    /////////////////////

    // doCommands is a global variable for HandShakeset in radio.onReceivedString(function (receivedString))
    let doCommands = true //TODO: Stond op false, waarschijnlijk voor leaf

    // define NeoPixel Strip
    /*
    let strip: neopixel.Strip = null
    strip = neopixel.create(DigitalPin.P1, 10, NeoPixelMode.RGB)
    strip.clear()
    strip.show()
    */

    function processC2D (s:string) {
        // process cloud commands
        if (!(s.isEmpty())) {
            const t0:string[] = s.split(":")
            if (t0.length == 1) {
                // received a generic command
                const t1:string[] = s.split("(")        //t1=cmd
                const t2:string[] = t1[1].split(")")    //t2=string of parameters
                const t3:string[] = t2[0].split(",")    //t3=array of parameters
                const cmd = convertToText(t1[0])
                const p1 = t3[0]
                const p2 = t3[1]
                const p3 = t3[2]
                s = "" // TODO waarom ??
                //basic.showString("" + cmd + (p1))
                invokeCommands(cmd, p1,p2,p3)
            }
            if (t0.length == 2) {
                if (parseFloat(t0[0]) == identity) {
                    // received a specific command for this device
                    const t1 = t0[1].split("(")
                    const t2 = t1[1].split(")")
                    const t3 = t2[0].split(",")
                    const cmd = convertToText(t1[0])
                    const p1 = t3[0]
                    const p2 = t3[1]
                    const p3 = t3[2]
                    s = "" //TODO: Waarom ??
                    invokeCommands(cmd, p1,p2,p3)
                }
            }
        }
    }

 
    function invokeCommands (cmd:string, p1:string, p2:string, p3:string) {
        if (true) { //TODO hier stond if doCommands .....
            // run this once and wait for new HandShake from Leaf Device
            // doCommands is set in radio.onReceivedString(function (receivedString))
            doCommands = false
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
                setServo(parseFloat(p1))
            }
            if (cmd == "digitalWrite") {
                setDigitalPin(parseFloat(p1), parseFloat(p2))
            }
            if (cmd == "analogWrite") {
                setAnalogPin(parseFloat(p1), parseFloat(p2))
            }
            //TODO reportedproperties = multiple parameters, first check this one.
            //addProperty(cmd, parseFloat(p1))
        }
    }

    function setAnalogPin (pin: number, value: number) {
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
            const iconnumber = randint(0, 2)
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

    function setServo (value: number) {
        basic.showString("s")
        pins.servoWritePin(AnalogPin.P0, value)
        basic.pause(1000)
        basic.clearScreen()
    }

    function setRGB (r: number, g: number, b: number) {
        /*
        basic.showString("r")
        strip.showColor(neopixel.rgb(r, g, b))
        basic.pause(1000)
        basic.clearScreen()
        */
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
        /*
        strip.setBrightness(value)
        strip.showRainbow(1, 360)
        strip.show()
        */
    }

    function who () {
        basic.showNumber(identity)
    }

    function setColor (color: string) {
        basic.showString("c")
        /*
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
        //TODO reportedproperties = "\"" + color + "\""
        */
    }

    /////////////////////
    // End IoT Commands
    /////////////////////
}
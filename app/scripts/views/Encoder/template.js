<div class="widgetAuthoring">
    <div class="widgetTop typeIO">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>
    <div class="widgetLeft">
        <div class="leftTab"><input type="checkbox" rv-checked="widget:active" /></div>
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
        <div class="leftTab pinTab" title="Encoder pin A">
            <input class="pinInput" type="text" rv-value="widget:pin">
        </div>
        <div class="leftTab pinTab" title="Encoder pin B">
            <input class="pinBInput" type="text" rv-value="widget:pinB">
        </div>
    </div>

    <div class="widgetBody">
        <div class="dialwrapper" style="position:relative;">
            <div class="statusDot" rv-title="widget:statusTitle"
                rv-class-encidle="widget:encoderStatus | isEncoderStatus idle"
                rv-class-encwaiting="widget:encoderStatus | isEncoderStatus waiting"
                rv-class-encok="widget:encoderStatus | isEncoderStatus ok"
                rv-class-encerror="widget:encoderStatus | isEncoderStatus error"></div>
            <div class="display outvalue" rv-text="widget:out | rounded">0</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:count" rv-encoderknob="widget:count"/></div>
        </div>

        <table class="rangeTable" border="0" cellspacing="3" cellpadding="0">
          <tr>
            <td><input class="range-input" type="text" pattern="[0-9\-]*" title="min" rv-value="widget:min"></td>
            <td><input class="range-input" type="text" pattern="[0-9\-]*" title="max" rv-value="widget:max"></td>
          </tr>
        </table>

        <div class="options">
              <ul>
                <li title="reverse direction" class='invert' rv-class-active="widget:invert">rev</li>
                <li title="wrap around past min/max" class="wrap" rv-class-active="widget:wrap">wrap</li>
                <li title="easing" class="easing" rv-class-active="widget:easing">eas</li>
              </ul>
        </div>
    </div>
    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to"><div class="dot">&middot;</div></div>
        </div>
    </div>
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class="narrowLabel">Device</label> <select type="text" rv-value="widget:deviceType">
                <option selected value="ArduinoUno">Serial</option>
                <option selected value="network">Network</option>
            </select><br>
            <div class="deviceIp" rv-class-networkmode="widget:deviceType | isNetworkDeviceType">
                <label class="narrowLabel">ip</label> <input class="address" type="text" pattern="[0-9]*" rv-value="widget:server">
            </div>
            <div class="devicePort" rv-class-networkmode="widget:deviceType | isNetworkDeviceType">
                <label class="narrowLabel">port</label> <input class="port" type="text" pattern="[0-9]*" rv-value="widget:port">
            </div>
            <div class="serialPortPicker" rv-class-networkmode="widget:deviceType | isNetworkDeviceType">
                <span class="noSerialMessage">Needs ConfigurableFirmata</span>
            </div>
            <div class="encoderStatusText" rv-text="widget:statusTitle"></div>
            <hr>
            <label class="narrowLabel wordLabel">step</label> <input class="moreParam" type="text" pattern="[0-9.]*" title="How much each click of the encoder adds or subtracts" rv-value="widget:step"><br>
            <label class="narrowLabel wordLabel">edges</label> <input class="moreParam" type="text" pattern="[0-9]*" title="Encoder signal edges per click: 4 for most encoders, 2 if the value only changes every other click" rv-value="widget:edgesPerClick"><br>
            <label class="narrowLabel wordLabel">ease</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:easingAmount">
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/encoder/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

<div class="widgetAuthoring">
    <div class="widgetTop typeIO">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>
    <div class="widgetLeft">
        <div class="leftTab"><input type="checkbox" rv-checked="widget:active" /></div>
    </div>

    <div class="widgetBody">
        <select class="sensorSelect"></select>
        <div class="deviceId" rv-text="widget:deviceId"></div>
        <div class="groveStatus">
            <div class="statusDot"
                rv-class-groveidle="widget:sensorStatus | isGroveStatus idle"
                rv-class-grovewaiting="widget:sensorStatus | isGroveStatus waiting"
                rv-class-groveok="widget:sensorStatus | isGroveStatus ok"
                rv-class-groveerror="widget:sensorStatus | isGroveStatus error"></div>
            <span class="statusText" rv-text="widget:sensorStatus"></span>
        </div>
        <div class="outletLabels" rv-text="widget:outs | outletTitles"></div>

        <div class="options">
              <ul>
                <li title="invert" class='invert' rv-class-active="widget:invert">inv</li>
                <li title="smoothing" class="smoothing" rv-class-active="widget:smoothing">smo</li>
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
                <span class="noSerialMessage">Doesn't support serial</span>
            </div>
            <div class="pinField" rv-class-visible="widget:needsPin">
                <label class="narrowLabel">pin</label> <input class="pinInput" type="text" pattern="[A-Za-z0-9]*" rv-value="widget:pin" placeholder="D7">
            </div>
            <hr>
            input range<br>
            <label class="narrowLabel">min</label> <input class="moreParam" type="text" pattern="[0-9-]*" rv-value="widget:inputFloor">
            <label class="narrowLabel">max</label> <input class="moreParam" type="text" pattern="[0-9-]*" rv-value="widget:inputCeiling"><br>
            output range<br>
            <label class="narrowLabel">min</label> <input class="moreParam" type="text" pattern="[0-9-]*" rv-value="widget:outputFloor">
            <label class="narrowLabel">max</label> <input class="moreParam" type="text" pattern="[0-9-]*" rv-value="widget:outputCeiling"><br>
            <label class="narrowLabel">ease</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:easingAmount"><br>
            <label class="narrowLabel">smooth</label> <input class='smoothingAmount moreParam' type="text" pattern="[0-9]*" rv-value="widget:smoothingAmount">
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/grovesensor/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

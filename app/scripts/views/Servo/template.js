<div class="widgetAuthoring">
    <div class="widgetTop typeIO">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="dialwrapper" style="position:relative;">
            <div class="display invalue" rv-text="widget:in | rounded">0</div>
            <div class="display outvalue" rv-text="widget:out | rounded">180</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
        </div>
    </div>

    <div class="widgetRight">
        <div class=rightTab><input type="checkbox" rv-checked="widget:activeOut" /></div>
        <div class=rightTab>
            <div rv-each-source="sources" class="settings">
                <input type='text' rv-value="source.map.destinationField | capitalize" rv-show="source.model.attributes.type | exists">
            </div>
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
              <label class="narrowLabel">port</label> <select class="serialPortSelect" rv-value="widget:server">
                <option value="auto">Auto-detect</option>
              </select>
            </div>
            <hr>
            <div class="servoLimits">
              <label class="servoLabel" title="Keep the servo between these angles - e.g. to stop a gate before it hits its end stops">angle</label>
              <input class="servoField" type="text" rv-value="widget:servoAngleMin" title="Lowest angle the servo is sent (0-180)"> to
              <input class="servoField" type="text" rv-value="widget:servoAngleMax" title="Highest angle the servo is sent (0-180)"><br>
              <label class="servoLabel" title="How fast the servo may turn. Faster moves are slowed to this speed, so a jump becomes a smooth move. Blank: no limit">max speed</label>
              <input class="servoField" type="text" rv-value="widget:servoMaxSpeed" title="Degrees per second - blank for no limit"> &deg;/s<br>
              <label class="servoLabel" title="The control pulse for 0 and 180 degrees, in microseconds. Widen it (e.g. 500 to 2500) if the servo doesn't turn a full 180; narrow it (e.g. 1000 to 2000) if it buzzes at the ends">pulse</label>
              <input class="servoField" type="text" rv-value="widget:servoPulseMin" rv-class-error="widget:servoPulseError" title="Pulse width for 0 degrees, microseconds (default 600)"> to
              <input class="servoField" type="text" rv-value="widget:servoPulseMax" rv-class-error="widget:servoPulseError" title="Pulse width for 180 degrees, microseconds (default 2400)"> &micro;s
              <div class="servoPulseNote" rv-show="widget:servoPulseError">needs 300-3000, low first - using 600-2400</div>
            </div>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/servo/" target="_blank">Widget help</a>
        </div>
    </div>



</div>

<div class="widgetAuthoring">
    <div class="widgetTop typeIO">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="neoPixelPreview" rv-class-ring="widget:previewShape | isRing">
            <div rv-each-pixelIndex="widget:pixelIndexes" class="pixel"></div>
        </div>
    </div>

    <div class="widgetRight">
        <div class=rightTab><input type="checkbox" rv-checked="widget:activeOut" /></div>
        <div class=rightTab>
            <div class="settings">
                <input type="text" rv-value="widget:pin">
            </div>
        </div>
    </div>
    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content neoPixelMore">
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
            <label class="narrowLabel">pixels</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:numPixels"><br>
            <label class="narrowLabel">format</label> <select class="moreParam" rv-value="widget:pixelFormat">
              <option value="RGB">RGB</option>
              <option value="RGBW">RGBW</option>
            </select><br>
            <hr>
            <label class="narrowLabel">mode</label> <select class="moreParam" rv-value="widget:mode">
              <option value="full">Full</option>
              <option value="chase">Chase</option>
              <option value="sparkle">Sparkle</option>
              <option value="rainbow">Rainbow</option>
              <option value="vu">VU meter</option>
            </select><br>
            <label class="narrowLabel">speed</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:speed"><br>
            <label class="narrowLabel">color</label> <input class="moreParam" type="color" rv-value="widget:displayColor"><br>
            <label class="narrowLabel">brightness</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:brightness"><br>
            <hr>
            <label class="narrowLabel">preview</label> <select class="moreParam" rv-value="widget:previewShape">
              <option value="strip">Strip</option>
              <option value="ring">Ring</option>
            </select><br>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/neopixel/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

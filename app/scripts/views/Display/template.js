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
        <div class="oledPreview">
            <div class="oledLine" rv-text="widget:line1Text"></div>
            <div class="oledLine" rv-text="widget:line2Text"></div>
            <div class="oledLine" rv-text="widget:line3Text"></div>
        </div>
    </div>

    <div class="widgetRight">
        <div class=rightTab><input type="checkbox" rv-checked="widget:activeOut" /></div>
        <!-- The mapped-pin display AnalogOut/DigitalOut/Servo show here
             is hidden for Display - it has no real pin, only ever the
             fixed 'display' sentinel (see Display.js's own comment), so
             it has nothing useful to tell the user. Revisit if/when
             multi-OLED support (see [[display_widget_spec]] memory)
             makes "which display" a real, meaningful choice again. -->
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
            <div class="lineConfig">
              <label class="narrowLabel">line 1</label> <span class="lineDecimals">decimals <input type="text" pattern="[0-9]*" rv-value="widget:line1Decimals"></span> <span class="lineBlank" title="Show nothing on this line, whatever is wired into its inlet"><input type="checkbox" rv-checked="widget:line1Blank"> blank</span><br>
              <input class="linePrepend" type="text" placeholder="prepend" rv-value="widget:line1Prepend">
              <span class="lineValue" rv-text="widget:line1Value"></span>
              <input class="lineAppend" type="text" placeholder="append" rv-value="widget:line1Append">
              <br><input class="lineFormat" type="text" placeholder="or format: &lt;1:2&gt;:&lt;2:2&gt;:&lt;3:2&gt;" title="Optional. Replaces prepend/value/append for this line. &lt;1&gt; &lt;2&gt; &lt;3&gt; insert the three inputs; &lt;1:2&gt; pads a number with zeros to 2 digits." rv-value="widget:line1Format">
            </div>
            <div class="lineConfig">
              <label class="narrowLabel">line 2</label> <span class="lineDecimals">decimals <input type="text" pattern="[0-9]*" rv-value="widget:line2Decimals"></span> <span class="lineBlank" title="Show nothing on this line, whatever is wired into its inlet"><input type="checkbox" rv-checked="widget:line2Blank"> blank</span><br>
              <input class="linePrepend" type="text" placeholder="prepend" rv-value="widget:line2Prepend">
              <span class="lineValue" rv-text="widget:line2Value"></span>
              <input class="lineAppend" type="text" placeholder="append" rv-value="widget:line2Append">
              <br><input class="lineFormat" type="text" placeholder="or format: &lt;1:2&gt;:&lt;2:2&gt;:&lt;3:2&gt;" title="Optional. Replaces prepend/value/append for this line. &lt;1&gt; &lt;2&gt; &lt;3&gt; insert the three inputs; &lt;1:2&gt; pads a number with zeros to 2 digits." rv-value="widget:line2Format">
            </div>
            <div class="lineConfig">
              <label class="narrowLabel">line 3</label> <span class="lineDecimals">decimals <input type="text" pattern="[0-9]*" rv-value="widget:line3Decimals"></span> <span class="lineBlank" title="Show nothing on this line, whatever is wired into its inlet"><input type="checkbox" rv-checked="widget:line3Blank"> blank</span><br>
              <input class="linePrepend" type="text" placeholder="prepend" rv-value="widget:line3Prepend">
              <span class="lineValue" rv-text="widget:line3Value"></span>
              <input class="lineAppend" type="text" placeholder="append" rv-value="widget:line3Append">
              <br><input class="lineFormat" type="text" placeholder="or format: &lt;1:2&gt;:&lt;2:2&gt;:&lt;3:2&gt;" title="Optional. Replaces prepend/value/append for this line. &lt;1&gt; &lt;2&gt; &lt;3&gt; insert the three inputs; &lt;1:2&gt; pads a number with zeros to 2 digits." rv-value="widget:line3Format">
            </div>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/display/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

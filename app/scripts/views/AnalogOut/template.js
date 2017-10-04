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
        <div class="dialwrapper" style="position:relative;">
            <div class="display invalue" rv-text="widget:in | rounded">100</div>
            <div class="display outvalue" rv-text="widget:out | rounded">1023</div>
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
          <option selected value="mkr1000">Network</option>
        </select><br>
            <div class="deviceIp">
              <label class="narrowLabel">ip</label> <input class="address" type="text" pattern="[0-9]*" rv-value="widget:server">
            </div>
            <div class="devicePort">
              <label class="narrowLabel">port</label> <input class="port" type="text" pattern="[0-9]*" rv-value="widget:port">
            </div>

        </div>
    </div>
</div>

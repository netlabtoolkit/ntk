<div class="widgetAuthoring">
    <div class="widgetTop typeIn">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class=leftTab><input id="getFromCloud" type="checkbox" rv-checked="widget:getFromCloud" /></div>
    </div>

    <div class="widgetBody">
        <div class="dialwrapper" style="position:relative;">
            <input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/>
            <div class="display invalue" rv-text="widget:in | rounded">100</div>
            <div class="display outvalue" rv-text="widget:out | rounded">1023</div>
        </div>
        <table class="rangeTable" border="0" cellspacing="3" cellpadding="0">
          <tr>
            <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputFloor"></td>
            <td><input class="range-input" type="text" pattern="[0-9]*" rv-value="widget:outputCeiling"></td>
          </tr>
        </table>
        <div class='timeLeft'>Get in: 10s</div>

    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>


    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            
            <label>get every</label> <input type="text" rv-value="widget:getPeriod">
            <hr>
            <select id="cloudService" rv-value="widget:cloudService">
              <option value="sparkfun">Sparkfun Phant</option>
              <option value="spark">Spark.io</option>
            </select>
              <br>
            <div id="sparkfun">
                <label for="dataField">data field</label> <input name="dataField" class="keys" type="text" rv-value="widget:dataField"><br>
                <label>public key</label> <input class="keys" type="text" placeholder="Public Key" rv-value="widget:publicKey"><br>
            </div>
            <div id="spark">
                <label>pin</label> <input class="keys" type="text" rv-value="widget:sparkPin"><br>
                <label for="sparkDeviceId">device id</label> <input placeholder="Device ID" name="sparkDeviceId" class="keys" type="text" rv-value="widget:sparkDeviceId"><br>
                <label>token</label> <input placeholder="Access Token" class="keys" type="text" rv-value="widget:sparkAccessToken"><br>
            </div>
        </div>
    </div>
</div>
<div class="widgetAuthoring">
    <div class="widgetTop typeNetwork">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class=leftTab><input class="getFromCloud" type="checkbox" rv-checked="widget:getFromCloud" /></div>
    </div>

    <div class="widgetBody">
        <div class="dialwrapper" style="position:relative;">
            <div class="display invalue" rv-text="widget:in | rounded">100</div>
            <div class="display outvalue" rv-text="widget:out | rounded">1023</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
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
            <select class="cloudService" rv-value="widget:cloudService">
              <option value="sparkfun">SparkfunPhant</option>
              <option value="particle">Particle.io</option>
            </select>
              <br>
            <div class="sparkfun">
                <label for="dataField">data field</label> <input name="dataField" class="keys" type="text" rv-value="widget:phantDataField"><br>
                <label>public key</label> <input class="keys" type="text" placeholder="Public Key" rv-value="widget:phantPublicKey"><br>
                <label>server url</label> <input class="keys" type="text" placeholder="Server URL" rv-value="widget:phantUrl"><br>
            </div>
            <div class="particle">
                <label>pin</label> <input class="keys" type="text" rv-value="widget:particlePin"><br>
                <label for="particleDeviceId">device id</label> <input placeholder="Device ID" name="particleDeviceId" class="keys" type="text" rv-value="widget:particleDeviceId"><br>
                <label>token</label> <input placeholder="Access Token" class="keys" type="text" rv-value="widget:particleAccessToken"><br>
            </div>
        </div>
    </div>
</div>
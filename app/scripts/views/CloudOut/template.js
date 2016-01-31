<div class="widgetAuthoring">
    <div class="widgetTop typeNetwork">
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
<!--            <div class="display invalue" rv-text="widget:in | rounded">100</div>-->
            <div class="display outvalue" rv-text="widget:out | rounded">1023</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
        </div>
        <br><div class='timeLeft'>Send in: 10s</div>

    </div>

    <div class="widgetRight">
        <div class=rightTab><input class="sendToCloud" type="checkbox" rv-checked="widget:sendToCloud" /></div>
    </div>


    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label for="avg">avg inputs</label> <input name="avg" type="checkbox" rv-checked="widget:averageInputs" /> <br>
<!--            <label for="round">rnd output</label> <input name="avg" type="checkbox" rv-checked="widget:roundOutput" /> <br>-->
            <label for="send">send every</label> <input name="send" type="text" rv-value="widget:sendPeriod"><br>
            <hr>
            <select class="cloudService" rv-value="widget:cloudService">
              <option value="sparkfun">SparkfunPhant</option>
              <option value="particle">Particle.io</option>
            </select>
              <br>
                <div class="sparkfun">
                    <label for="dataField">data field</label> <input name="dataField" class="keys" type="text" rv-value="widget:phantDataField"><br>
                    <label for="pubKey">public key</label> <input name="pubKey" class="keys" type="text" placeholder="Public Key" rv-value="widget:phantPublicKey"><br>
                    <label for="priKey">private key</label> <input name="priKey" class="keys" type="text" placeholder="Private Key" rv-value="widget:phantPrivateKey"><br>
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
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
           <div class="display invalue" rv-text="widget:in | rounded">100</div>
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
            io.adafruit.com<br>
            <label for="aioUsername">username</label> <input name="aioUsername" class="keys" type="text" rv-value="widget:aioUsername"><br>
            <label for="aioKey">AIO key</label> <input name="aioKey" class="keys" type="text" placeholder="AIO Key" rv-value="widget:aioKey"><br>
            <label for="aioFeedKey">feed key</label> <input name="aioFeedKey" class="keys" type="text" placeholder="Feed Key" rv-value="widget:aioFeedKey"><br>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/cloudout/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

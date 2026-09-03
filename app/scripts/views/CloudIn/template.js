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
            io.adafruit.com<br>
            <label for="aioUsername">username</label> <input name="aioUsername" class="keys" type="text" rv-value="widget:aioUsername"><br>
            <label for="aioKey">AIO key</label> <input name="aioKey" class="keys" type="text" placeholder="AIO Key" rv-value="widget:aioKey"><br>
            <label for="aioFeedKey">feed key</label> <input name="aioFeedKey" class="keys" type="text" placeholder="Feed Key" rv-value="widget:aioFeedKey"><br>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/cloudin/" target="_blank">Widget help</a>
        </div>
    </div>
</div>
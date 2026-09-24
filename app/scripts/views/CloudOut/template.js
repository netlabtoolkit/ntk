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
            <div class="display outvalue" rv-text="widget:displayOut | rounded">1023</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
        </div>
        <br><div class='timeLeft' rv-class-cloudconnected="widget:cloudConnected" rv-text="widget:cloudConnected | cloudStatusText"></div>

    </div>

    <div class="widgetRight">
        <div class=rightTab><input type="checkbox" rv-checked="widget:activeOut" /></div>
    </div>


    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label>host</label> <input name="host" type="text" placeholder="broker host" rv-value="widget:host"><br>
            <label>port</label> <input class="port" type="text" pattern="[0-9]*" rv-value="widget:port"><br>
            <label>topic</label> <input name="topic" type="text" rv-value="widget:topic"><br>
            <label>TLS</label> <input name="tls" type="checkbox" rv-checked="widget:tls">
            <hr>
            <label>user</label> <input name="username" type="text" rv-value="widget:username"><br>
            <label>pass</label> <input name="password" type="password" rv-value="widget:password">
            <hr>
            <label>min ms</label> <input class="moreParam" style="margin-right:8px" name="sendInterval" type="text" pattern="[0-9]*" rv-value="widget:sendInterval">
            <label class="narrowLabel">avg</label> <input name="averageInputs" type="checkbox" rv-checked="widget:averageInputs">
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/cloudout/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

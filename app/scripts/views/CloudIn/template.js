<div class="widgetAuthoring">
    <div class="widgetTop typeNetwork">
        <div class="title dragHandle">
        { widget:title } <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class=leftTab>
			<input type="checkbox" rv-checked="widget:active" />
		</div>
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
        <div class='timeLeft' rv-class-cloudconnected="widget:cloudConnected" rv-text="widget:cloudConnected | cloudStatusText"></div>

    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
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
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/cloudin/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

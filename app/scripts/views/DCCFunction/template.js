<div class="widgetAuthoring">
    <div class="widgetTop typeNetwork">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class="leftTab"><input type="checkbox" rv-checked="widget:active" title="Connect to the station and take this loco" /></div>
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-title="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="dccFnWrapper">
            <div class="statusDot" rv-title="widget:statusText"
                rv-class-dccidle="widget:statusKind | isDccStatus idle"
                rv-class-dccwaiting="widget:statusKind | isDccStatus waiting"
                rv-class-dccpower="widget:statusKind | isDccStatus power"
                rv-class-dccok="widget:statusKind | isDccStatus ok"
                rv-class-dccerror="widget:statusKind | isDccStatus error"></div>
            <button type="button" class="dccFnButton" rv-class-on="widget:fnOn" title="Click to switch this function on or off">
                <span class="dccFnName" rv-text="widget:fnLabel">F0</span>
                <span class="dccFnState" rv-text="widget:fnStateText">off</span>
            </button>
        </div>

        <div class="dccStatus" rv-class-clickable="widget:powerOff" rv-class-error="widget:statusKind | isDccStatus error" rv-title="widget:statusTitle"><span rv-text="widget:statusText"></span><span class="dccPowerHint">click to turn on</span></div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-title="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class="narrowLabel">station</label> <input class="dccHost" type="text" title="The command station's IP address, or 'simulated' to try a patch with no layout" rv-value="widget:stationHost"><br>
            <label class="narrowLabel">port</label> <input class="moreParam" type="text" pattern="[0-9]*" title="WiThrottle port - 2560 on DCC-EX, 12090 on JMRI" rv-value="widget:stationPort"><br>
            <label class="narrowLabel">loco</label> <input class="moreParam" type="text" pattern="[0-9]*" title="The loco's DCC address (1-10239)" rv-value="widget:loco"><br>
            <label class="narrowLabel">F</label> <input class="moreParam" type="text" pattern="[0-9]*" title="DCC function number (0 = headlight)" rv-value="widget:fn"><br>
            <div class="dccStatusText" rv-text="widget:statusTitle"></div>
            <hr>
            <input type="checkbox" rv-checked="widget:toggle"> toggle
            <div class="dccNote">On: each press on the inlet switches the function (e.g. a headlight from a button). Off: the function follows the inlet - on while it's high (e.g. a horn).</div>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/dccfunction/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

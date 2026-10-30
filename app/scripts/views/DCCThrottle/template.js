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
        <div class="dialwrapper" style="position:relative;" title="Drag or scroll to set the speed (0-126)">
            <div class="statusDot" rv-title="widget:statusText"
                rv-class-dccidle="widget:statusKind | isDccStatus idle"
                rv-class-dccwaiting="widget:statusKind | isDccStatus waiting"
                rv-class-dccok="widget:statusKind | isDccStatus ok"
                rv-class-dccerror="widget:statusKind | isDccStatus error"></div>
            <div class="display outvalue" rv-text="widget:speed">0</div>
            <div style="position:relative;"><input type="text" class="dial" rv-value="widget:speed" rv-dccknob="widget:speed"/></div>
        </div>

        <div class="dccButtons">
            <button type="button" class="dccDirection" rv-class-reverse="widget:reverse" title="Direction - click to change">
                <span class="dccFwd">fwd ▶</span><span class="dccRev">◀ rev</span>
            </button>
            <button type="button" class="dccStop" title="Emergency stop this loco">STOP</button>
        </div>

        <div class="dccStatus" rv-class-clickable="widget:powerOff" rv-class-error="widget:statusKind | isDccStatus error" rv-text="widget:statusText" rv-title="widget:statusTitle"></div>
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
            <div class="dccStatusText" rv-text="widget:statusTitle"></div>
            <hr>
            <label class="wide-label">speed inlet range</label>
            <input class="range-input" type="text" pattern="[0-9\-.]*" title="Speed inlet value for stopped" rv-value="widget:inMin">
            <input class="range-input" type="text" pattern="[0-9\-.]*" title="Speed inlet value for full speed (126)" rv-value="widget:inMax">
            <hr>
            <div class="dccNote">STOP is an emergency stop for this loco only. For every train, turn off track power.</div>
            <div class="dccNote">Lights and sounds: add a DCC Function widget for each.</div>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/dccthrottle/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

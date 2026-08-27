<div class="widgetAuthoring">
    <div class="widgetTop typeGenerator">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class="leftTab"><input type="checkbox" rv-checked="widget:active" /></div>
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="widgetBodyLeft">
            <div class="dialwrapper" style="position:relative;">
                <div class="display invalue" rv-text="widget:in | rounded">0</div>
                <div style="position:relative;"><input type="text" class="dial" rv-value="widget:in" rv-knob="widget:in"/></div>
            </div>
            <div class="trackStatus"
                rv-class-tracking="widget:tracking"
                rv-class-detected="widget:faceDetected"
                rv-class-pending="widget:trackingState | faceTrackPending"></div>
            <div class="statusMessage" rv-show="widget:statusMessage" rv-text="widget:statusMessage"></div>
        </div>
        <div class="widgetBodyRight">
            <div class="outletValue"><span class="outletLabel">x</span><span rv-text="widget:x | rounded">0</span></div>
            <div class="outletValue"><span class="outletLabel">y</span><span rv-text="widget:y | rounded">0</span></div>
            <div class="outletValue"><span class="outletLabel">smile</span><span rv-text="widget:smile | rounded">0</span></div>
            <div class="outletValue"><span class="outletLabel">face</span><span rv-text="widget:faceDetected | rounded">0</span></div>
        </div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class="wide-label">threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label class="wide-label">wait time true</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:waitTimeTrue"><br>
            <label class="wide-label">wait time false (latch)</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:waitTimeFalse"><br>

            <label class="wide-label">simulate (no camera)</label> <input type="checkbox" rv-checked="widget:simulate" /><br>
            <div rv-show="widget:simulate">
                <label class="wide-label">x</label> <input type="range" min="0" max="1023" rv-rangevalue="widget:simX"><br>
                <label class="wide-label">y</label> <input type="range" min="0" max="1023" rv-rangevalue="widget:simY"><br>
                <label class="wide-label">smile</label> <input type="range" min="0" max="1023" rv-rangevalue="widget:simSmile"><br>
                <label class="wide-label">face detected</label> <input type="checkbox" rv-checked="widget:simFaceDetected"><br>
            </div>

            <div class="cameraPreview" rv-show="widget:tracking">
                <% if(!server) { %>
                <video class="faceVideo" width="190" height="143" autoplay muted playsinline></video>
                <canvas class="faceCanvas" width="190" height="143"></canvas>
                <% } %>
            </div>
        </div>
    </div>
</div>

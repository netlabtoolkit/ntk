<div class="widgetAuthoring">
    <div class="headerPorts headerStart"><div class="inlet headerPort" data-field="in1" alt="start" title="start: listen when this rises past the threshold">&#9656;</div></div>
    <div class="headerPorts headerDone"><div class="outlet headerPort" data-field="out2" alt="done" title="done: pulses when a transcript arrives" rv-class-ctlflash="widget:done">&#9656;</div></div>
    <div class="widgetTop typeAI" rv-class-ctlrunning="widget:recording">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:bodyIns" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="recordButton" rv-class-starting="widget:recording" rv-class-recording="widget:live" title="Hold to talk, or click and speak (click again to stop)"></div>
        <div class="speechStatus" rv-text="widget:statusLabel"></div>
        <div class="speechTranscript" rv-show="widget:partial" rv-text="widget:partial"></div>
        <div class="speechTranscript" rv-hide="widget:partial" rv-text="widget:output"></div>
        <div class="speechError" rv-show="widget:statusText" rv-text="widget:statusText"></div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:bodyOuts" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class="narrowLabel">language</label>
            <select class="localeSelect"></select><br>
            <label class="narrowLabel">threshold</label>
            <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label class="narrowLabel" title="when start isn't held: stop listening after a pause this long">pause</label>
            <input class="moreParam" type="text" rv-value="widget:pauseSeconds"> s<br>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets/speechin/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

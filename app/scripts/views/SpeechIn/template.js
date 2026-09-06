<div class="widgetAuthoring">
    <div class="widgetTop typeAI">
        <div class="title dragHandle">
            {widget:title} <div class="remove">×</div>
        </div>
    </div>

    <div class="widgetLeft">
        <div class='inlets'>
            <div rv-each-inlet="widget:ins" rv-alt="inlet.title" rv-data-field="inlet.to" class='inlet'>&middot;</div>
        </div>
    </div>

    <div class="widgetBody">
        <div class="recordButton" rv-class-recording="widget:recording" title="Hold to record"></div>
        <div class="speechStatus" rv-text="widget:status"></div>
        <div class="speechTranscript" rv-show="widget:partial" rv-text="widget:partial"></div>
        <div class="speechTranscript" rv-hide="widget:partial" rv-text="widget:output"></div>
        <div class="speechError" rv-show="widget:statusText" rv-text="widget:statusText"></div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label class="narrowLabel">language</label>
            <select class="localeSelect"></select><br>
            <label class="narrowLabel">threshold</label>
            <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/speechin/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

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
        <div class="playButton" rv-class-speaking="widget:speaking" title="Play / stop"></div>
        <div class="speechTranscript" rv-text="widget:in2"></div>
        <div class="ttsEngine" rv-text="widget:engine"></div>
        <div class="speechError" rv-show="widget:statusText" rv-text="widget:statusText"></div>
    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content speechOutMore">
            <label>voice</label><br>
            <select class="voice"></select>
            <label>rate</label>
            <input class="rate" type="range" min="0.2" max="0.9" step="0.05" rv-value="widget:rate"><br>
            <label class="wide-label">threshold</label>
            <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label class="checkRow"><input type="checkbox" rv-checked="widget:autoPlay" /> autoplay</label>
            <label class="checkRow"><input type="checkbox" rv-checked="widget:autoCancel" /> autocancel on trigger release</label>
            <label>text</label>
            <textarea class="database" rv-value="widget:in2" rows="3" cols="70"></textarea>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/speechout/" target="_blank">Widget help</a>
        </div>
    </div>
</div>

<div class="widgetAuthoring">
    <div class="widgetTop typeGenerator">
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
        <div class="widgetBodyLeft">
            <div class="inletValue"><span rv-text="widget:in1 | rounded">0</span></div>
        </div>
        <div class="widgetBodyRight">
            <div class="inletValue"><span class="speak outputSingle">speak</span></div>
        </div>
            <br><br>
            <span class='transcript' rv-text="widget:in2"> </span>
            <br>
        

    </div>

    <div class="widgetRight">
        
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label for="voice">voice</label><select name="voice" class="voice" rv-value="widget:voice"></select> <span class="voiceLang" rv-text="widget:lang"></span><br>
            <label for="select_language">language</label><select name="select_language" class="select_language" rv-value="widget:language"></select>&nbsp;&nbsp;
            <select class="select_dialect" rv-value="widget:dialect"></select><br>
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label>autoplay</label> <input type="checkbox" rv-checked="widget:autoPlay" /><br>
            <label>autocancel</label> <input type="checkbox" rv-checked="widget:autoCancel" /><br>
            <textarea class="database" rv-value="widget:in2" rows="4" cols="70"></textarea>
        </div>
    </div>
</div>
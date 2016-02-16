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
            <div class="inletValue"><span class="listen outputSingle">listen</span></div>
        </div>
            <br><br>
            <span class='transcript' rv-text="widget:final_transcript"> </span>
            <br>
        

    </div>

    <div class="widgetRight">
        <div class='outlets'>
            <div class="outlet" rv-each-outlet="widget:outs" rv-alt="outlet.title" rv-data-field="outlet.to">&middot;</div>
        </div>
    </div>

    <div class="widgetBottom">
        <div class="tab"><p>more</p></div>
        <div class="content">
            <label for="select_language">language</label><select name="select_language" class="select_language" rv-value="widget:language"></select>&nbsp;&nbsp;
            <select class="select_dialect" rv-value="widget:dialect"></select><br>
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label>continuous</label> <input class="continuous" type="checkbox" rv-checked="widget:continuous" /><br>
            <textarea class="database" rv-value="widget:final_transcript" rows="4" cols="70"></textarea>
        </div>
    </div>
</div>
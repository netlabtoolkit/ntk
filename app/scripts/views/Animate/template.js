<div class="widgetAuthoring">
    <div class="widgetTop typeProcess">
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
            <div class="inletValue"><span rv-text="widget:in | rounded">0</span></div>
            
            <div class="inletValueInput"><input type="text" pattern="[0-9]*" rv-value="widget:aniLength | rounded"></div>
            <div class="inletValueInput"><input type="text" pattern="[0-9]*" rv-value="widget:aniStart | rounded"></div>
            <div class="inletValueInput"><input type="text" pattern="[0-9]*" rv-value="widget:aniEnd | rounded"></div>
        </div>
        <div class="widgetBodyRight">  
                <div class="inletValue"><span class="outputSingle" rv-text="widget:out1 | rounded">0</span></div>
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
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold">
        </div>
        <div class="animateDiv">asdf</div>
    </div>
</div>
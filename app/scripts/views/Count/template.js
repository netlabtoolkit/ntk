<div class="widgetAuthoring">
    <div class="widgetTop typeLogic">
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
            <div class="inletValue"><span rv-text="widget:in2 | rounded">0</span></div>
            <div class="inletValue"><span rv-text="widget:in3 | rounded">0</span></div>
            <div class="inletValue"><span rv-text="widget:in4 | rounded">0</span></div>
        </div>
        <div class="widgetBodyRight">
            <div class="inletValue"><span class="outputSingle" rv-text="widget:out1 | rounded">0</span></div>
            <br>
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
            <label>increment</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:increment"><br>
            <label>min</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:outputFloor"><br>
            <label>max</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:outputCeiling"><br>
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <label>count val</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:output">
        </div>
    </div>
</div>
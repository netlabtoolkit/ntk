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
            <div class="inletValue"><span rv-text="widget:in0 | rounded">0</span> S1</div>
            <div class="inletValue"><span rv-text="widget:in1 | rounded">0</span> S2</div>
            <div class="inletValue"><span rv-text="widget:in2 | rounded">0</span> S3</div>
            <div class="inletValue"><span rv-text="widget:in3 | rounded">0</span> S4</div>
                
            
            
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
            <label>threshold</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:threshold"><br>
            <input class="loop" type="checkbox" rv-checked="widget:loop" /> Loop<br>
            <input class="return" type="checkbox" rv-checked="widget:returnToStart" /> Return to start value<br>
            <label>start</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:start"><br>
            <label>duration</label> <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:duration"><br>

            <hr>
            Sequence 1<br>
            <textarea class="database" rv-value="widget:sequence0" rows="4" cols="70"></textarea><br>
            Sequence 2<br>
            <textarea class="database" rv-value="widget:sequence1" rows="4" cols="70"></textarea><br>
            Sequence 3<br>
            <textarea class="database" rv-value="widget:sequence2" rows="4" cols="70"></textarea><br>
            Sequence 4<br>
            <textarea class="database" rv-value="widget:sequence3" rows="4" cols="70"></textarea><br>
        </div>
        <div class="animateDiv"></div>
    </div>
</div>
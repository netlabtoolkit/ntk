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
            <div class="inletValue"><span rv-text="widget:in0 | rounded">0</span> S1</div>
            <div class="inletValue"><span rv-text="widget:in1 | rounded">0</span> S2</div>
            <div class="inletValue"><span rv-text="widget:in2 | rounded">0</span> S3</div>
            <div class="inletValue"><span rv-text="widget:in3 | rounded">0</span> S4</div>
            
        </div>
        <div class="widgetBodyRight">  
            <div class="inletValue"><span class="outputSingle" rv-text="widget:out0 | rounded">0</span></div>
<!--            <div class="inletValue"><span class="outputSingle" rv-text="widget:out1 | rounded">0</span></div>
            <div class="inletValue"><span class="outputSingle" rv-text="widget:out2 | rounded">0</span></div>
            <div class="inletValue"><span class="outputSingle" rv-text="widget:out3 | rounded">0</span></div>-->
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
            <hr>
            <strong>Sequence 1</strong>, &nbsp;&nbsp;<input class="loop" type="checkbox" rv-checked="widget:loop0" /> &nbsp;loop, &nbsp;&nbsp;<input class="return" type="checkbox" rv-checked="widget:returnToStart0" /> return to <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:start0"> with a duration of <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:duration0"><br>
            <!--Send output to 
            <input name="sendTo0" type="radio" value='output0' rv-checked="widget:sendTo0"> 1 
            <input name="sendTo0" type="radio" value='output1' rv-checked="widget:sendTo0"> 2 
            <input name="sendTo0" type="radio" value='output2' rv-checked="widget:sendTo0"> 3 
            <input name="sendTo0" type="radio" value='output3' rv-checked="widget:sendTo0"> 4 -->
            
            <textarea class="database" rv-value="widget:sequence0" rows="4" cols="70"></textarea>
            <br><br>
            <strong>Sequence 2</strong>, &nbsp;&nbsp;<input class="loop" type="checkbox" rv-checked="widget:loop1" /> &nbsp;loop, &nbsp;&nbsp;<input class="return" type="checkbox" rv-checked="widget:returnToStart1" /> return to <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:start1"> with a duration of <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:duration1"><br>
            <!--Send output to 
            <input name="sendTo1" type="radio" value='output0' rv-checked="widget:sendTo1"> 1 
            <input name="sendTo1" type="radio" value='output1' rv-checked="widget:sendTo1"> 2 
            <input name="sendTo1" type="radio" value='output2' rv-checked="widget:sendTo1"> 3 
            <input name="sendTo1" type="radio" value='output3' rv-checked="widget:sendTo1"> 4 -->
            
            <textarea class="database" rv-value="widget:sequence1" rows="4" cols="70"></textarea>
            <br><br>
            <strong>Sequence 3</strong>, &nbsp;&nbsp;<input class="loop" type="checkbox" rv-checked="widget:loop2" /> &nbsp;loop, &nbsp;&nbsp;<input class="return" type="checkbox" rv-checked="widget:returnToStart2" /> return to <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:start2"> with a duration of <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:duration2"><br>
            <!--Send output to 
            <input name="sendTo2" type="radio" value='output0' rv-checked="widget:sendTo2"> 1 
            <input name="sendTo2" type="radio" value='output1' rv-checked="widget:sendTo2"> 2 
            <input name="sendTo2" type="radio" value='output2' rv-checked="widget:sendTo2"> 3 
            <input name="sendTo2" type="radio" value='output3' rv-checked="widget:sendTo2"> 4 -->
           
            <textarea class="database" rv-value="widget:sequence2" rows="4" cols="70"></textarea>
            <br><br>
            <strong>Sequence 4</strong>, &nbsp;&nbsp;<input class="loop" type="checkbox" rv-checked="widget:loop3" /> &nbsp;loop, &nbsp;&nbsp;<input class="return" type="checkbox" rv-checked="widget:returnToStart3" /> return to <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:start3"> with a duration of <input class="moreParam" type="text" pattern="[0-9]*" rv-value="widget:duration3"><br>
            <!--Send output to 
            <input name="sendTo3" type="radio" value='output0' rv-checked="widget:sendTo3"> 1 
            <input name="sendTo3" type="radio" value='output1' rv-checked="widget:sendTo3"> 2 
            <input name="sendTo3" type="radio" value='output2' rv-checked="widget:sendTo3"> 3 
            <input name="sendTo3" type="radio" value='output3' rv-checked="widget:sendTo3"> 4 -->
            
            <textarea class="database" rv-value="widget:sequence3" rows="4" cols="70"></textarea>
        </div>
        <div class="animateDiv"></div>
    </div>
</div>
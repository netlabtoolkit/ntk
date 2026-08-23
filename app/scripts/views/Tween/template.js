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
            <div class="inletValue"><span rv-text="widget:in | rounded">0</span></div>
            
            
        </div>
        <div class="widgetBodyRight">  
                <div class="inletValue"><span class="outputSingle" rv-text="widget:out1 | rounded">0</span></div>
                
        </div>
        <div class="inletValueInput"><input type="text" pattern="[0-9]*" rv-value="widget:duration | rounded"> time</div>
        <div class="inletValueInput"><input type="text" pattern="[0-9]*" rv-value="widget:start | rounded"> start</div>
        <div class="inletValueInput"><input type="text" pattern="[0-9]*" rv-value="widget:end | rounded"> end</div>
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
            <input class="return" type="checkbox" rv-checked="widget:returnToStart" /> Return to start value<br>
            <input class="loop" type="checkbox" rv-checked="widget:loop" /> Loop<br>
            <label class="wide-label">easing</label>
            <select class="easing" rv-value="widget:tweenEasing">
                <option value="linear">Linear</option>
                <optgroup label="Sine">
                    <option value="easeInSine">In</option>
                    <option value="easeOutSine">Out</option>
                    <option value="easeInOutSine">In-Out</option>
                </optgroup>
                <optgroup label="Quad">
                    <option value="easeInQuad">In</option>
                    <option value="easeOutQuad">Out</option>
                    <option value="easeInOutQuad">In-Out</option>
                </optgroup>
                <optgroup label="Cubic">
                    <option value="easeInCubic">In</option>
                    <option value="easeOutCubic">Out</option>
                    <option value="easeInOutCubic">In-Out</option>
                </optgroup>
                <optgroup label="Quartic">
                    <option value="easeInQuart">In</option>
                    <option value="easeOutQuart">Out</option>
                    <option value="easeInOutQuart">In-Out</option>
                </optgroup>
                <optgroup label="Quintic">
                    <option value="easeInQuint">In</option>
                    <option value="easeOutQuint">Out</option>
                    <option value="easeInOutQuint">In-Out</option>
                </optgroup>
                <optgroup label="Exponential">
                    <option value="easeInExpo">In</option>
                    <option value="easeOutExpo">Out</option>
                    <option value="easeInOutExpo">In-Out</option>
                </optgroup>
                <optgroup label="Circular">
                    <option value="easeInCirc">In</option>
                    <option value="easeOutCirc">Out</option>
                    <option value="easeInOutCirc">In-Out</option>
                </optgroup>
                <optgroup label="Elastic">
                    <option value="easeInElastic">In</option>
                    <option value="easeOutElastic">Out</option>
                    <option value="easeInOutElastic">In-Out</option>
                </optgroup>
                <optgroup label="Back">
                    <option value="easeInBack">In</option>
                    <option value="easeOutBack">Out</option>
                    <option value="easeInOutBack">In-Out</option>
                </optgroup>
                <optgroup label="Bounce">
                    <option value="easeInBounce">In</option>
                    <option value="easeOutBounce">Out</option>
                    <option value="easeInOutBounce">In-Out</option>
                </optgroup>
                <optgroup label="Gamma (LED)">
                    <option value="easeInGamma">In</option>
                    <option value="easeOutGamma">Out</option>
                    <option value="easeInOutGamma">In-Out</option>
                </optgroup>
            </select><br>
            <label class="wide-label">gamma</label> <input class="moreParam" type="text" pattern="[0-9.]*" rv-value="widget:gamma"><br>
            <a href="https://pvanallen.github.io/VarSpeedPython/docs/easings_cheatsheet/" target="_blank">easings cheatsheet</a><br>
        </div>
        <div class="animateDiv"></div>
    </div>
</div>
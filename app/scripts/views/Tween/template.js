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
            <label>easing</label>
            <select class="easing" rv-value="widget:tweenEasing">
                <option value="linear">Linear</option>
                <optgroup label="Sine">
                    <option value="easeInSine">SineEaseIn</option>
                    <option value="easeOutSine">SineEaseOut</option>
                    <option value="easeInOutSine">SineEaseInOut</option>
                </optgroup>
                <optgroup label="Quad">
                    <option value="easeInQuad">QuadEaseIn</option>
                    <option value="easeOutQuad">QuadEaseOut</option>
                    <option value="easeInOutQuad">QuadEaseInOut</option>
                </optgroup>
                <optgroup label="Cubic">
                    <option value="easeInCubic">CubicEaseIn</option>
                    <option value="easeOutCubic">CubicEaseOut</option>
                    <option value="easeInOutCubic">CubicEaseInOut</option>
                </optgroup>
                <optgroup label="Quartic">
                    <option value="easeInQuart">QuarticEaseIn</option>
                    <option value="easeOutQuart">QuarticEaseOut</option>
                    <option value="easeInOutQuart">QuarticEaseInOut</option>
                </optgroup>
                <optgroup label="Quintic">
                    <option value="easeInQuint">QuinticEaseIn</option>
                    <option value="easeOutQuint">QuinticEaseOut</option>
                    <option value="easeInOutQuint">QuinticEaseInOut</option>
                </optgroup>
                <optgroup label="Exponential">
                    <option value="easeInExpo">ExponentialEaseIn</option>
                    <option value="easeOutExpo">ExponentialEaseOut</option>
                    <option value="easeInOutExpo">ExponentialEaseInOut</option>
                </optgroup>
                <optgroup label="Circular">
                    <option value="easeInCirc">CircularEaseIn</option>
                    <option value="easeOutCirc">CircularEaseOut</option>
                    <option value="easeInOutCirc">CircularEaseInOut</option>
                </optgroup>
                <optgroup label="Elastic">
                    <option value="easeInElastic">ElasticEaseIn</option>
                    <option value="easeOutElastic">ElasticEaseOut</option>
                    <option value="easeInOutElastic">ElasticEaseInOut</option>
                </optgroup>
                <optgroup label="Back">
                    <option value="easeInBack">BackEaseIn</option>
                    <option value="easeOutBack">BackEaseOut</option>
                    <option value="easeInOutBack">BackEaseInOut</option>
                </optgroup>
                <optgroup label="Bounce">
                    <option value="easeInBounce">BounceEaseIn</option>
                    <option value="easeOutBounce">BounceEaseOut</option>
                    <option value="easeInOutBounce">BounceEaseInOut</option>
                </optgroup>
                <optgroup label="Gamma (LED)">
                    <option value="easeInGamma">GammaEaseIn</option>
                    <option value="easeOutGamma">GammaEaseOut</option>
                    <option value="easeInOutGamma">GammaEaseInOut</option>
                </optgroup>
            </select><br>
            <label>gamma</label> <input class="moreParam" type="text" pattern="[0-9.]*" rv-value="widget:gamma"><br>
            <a href="https://pvanallen.github.io/VarSpeedPython/docs/easings_cheatsheet/" target="_blank">easings cheatsheet</a><br>
            <hr>
            <a class="widgetHelpLink" href="https://www.netlabtoolkit.org/documentation/widgets-old/tween/" target="_blank">Widget help</a>
        </div>
        <div class="animateDiv"></div>
    </div>
</div>
'use strict';

const MULTIPLE_CHOICE_ERROR='AI가 제시한 단일 정답형 정답 선택지가 정확히 하나가 아닙니다.';
const SINGLE_NUMERIC_ERROR='수치 정답과 일치하는 선택지가 정확히 하나가 아닙니다.';

function requestedChoiceCount(body){
 const text=String(body||'').replace(/\$[^$]*\$/g,' ');
 const match=text.match(/(?:정답|답|보기|선택지|옳은\s*것|틀린\s*것)(?:을|를|이|은|는|으로)?\s*(?:정확히\s*)?(두|2|세|3)\s*개/u)
  ||text.match(/(두|2|세|3)\s*개(?:의)?\s*(?:정답|답|보기|선택지)/u);
 if(!match)return null;
 return /^(?:두|2)$/.test(match[1])?2:3;
}

function effectiveQuestionType(type,question){
 return (question?.choices?.length&&requestedChoiceCount(question.body)>1&&type==='single_choice')?'multiple_choice':type;
}

module.exports={requestedChoiceCount,effectiveQuestionType,MULTIPLE_CHOICE_ERROR,SINGLE_NUMERIC_ERROR};

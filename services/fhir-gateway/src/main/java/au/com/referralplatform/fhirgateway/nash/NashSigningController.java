package au.com.referralplatform.fhirgateway.nash;

import au.com.referralplatform.fhirgateway.nash.dto.NashSignature;
import au.com.referralplatform.fhirgateway.nash.dto.SignRequest;
import au.com.referralplatform.fhirgateway.nash.dto.VerifyRequest;
import au.com.referralplatform.fhirgateway.nash.dto.VerifyResult;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Base64;

@RestController
@RequestMapping("/nash")
public class NashSigningController {

  private final NashSigningService nashSigningService;

  public NashSigningController(NashSigningService nashSigningService) {
    this.nashSigningService = nashSigningService;
  }

  @PostMapping("/sign")
  public NashSignature sign(@Valid @RequestBody SignRequest request) throws NashSigningUnavailableException {
    byte[] content = Base64.getDecoder().decode(request.contentBase64());
    return nashSigningService.sign(content, request.signerHealthcareIdentifier());
  }

  @PostMapping("/verify")
  public VerifyResult verify(@Valid @RequestBody VerifyRequest request) throws NashSigningUnavailableException {
    byte[] content = Base64.getDecoder().decode(request.contentBase64());
    return new VerifyResult(nashSigningService.verify(content, request.signatureBase64()));
  }
}
